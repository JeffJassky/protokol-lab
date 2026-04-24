import mongoose from 'mongoose';
import ChatUsage from '../models/ChatUsage.js';
import {
  getEffectiveChatLimits,
  getEffectivePlanFeatures,
  getRecommendedUpgradePlanId,
  getQuotaWindows,
  getPlanForUser,
} from '../lib/planLimits.js';
import { childLogger } from '../lib/logger.js';

const log = childLogger('chat-quota');

// Machine-readable deny reasons. Keep stable — client may branch on them.
const REASONS = {
  FEATURE_DISABLED: 'chat_feature_disabled',
  PER_MINUTE: 'per_minute_rate_limit',
  DAILY_MESSAGES: 'daily_messages_cap',
  DAILY_INPUT_TOKENS: 'daily_input_tokens_cap',
  DAILY_OUTPUT_TOKENS: 'daily_output_tokens_cap',
  DAILY_COST: 'daily_cost_cap',
  MONTHLY_COST: 'monthly_cost_cap',
};

function formatUsd(n) {
  return `$${n.toFixed(2)}`;
}

function formatRelative(seconds) {
  if (seconds <= 60) return 'in under a minute';
  const mins = Math.ceil(seconds / 60);
  if (mins < 60) return `in about ${mins} minute${mins === 1 ? '' : 's'}`;
  const hrs = Math.floor(mins / 60);
  const remMin = mins % 60;
  if (hrs < 24) {
    return remMin
      ? `in about ${hrs}h ${remMin}m`
      : `in about ${hrs} hour${hrs === 1 ? '' : 's'}`;
  }
  const days = Math.ceil(hrs / 24);
  return `in about ${days} day${days === 1 ? '' : 's'}`;
}

function denyResponse(res, user, denial) {
  const upgradePlanId = getRecommendedUpgradePlanId(user);
  const statusCode = denial.reason === REASONS.FEATURE_DISABLED ? 403 : 429;
  if (denial.retryAfter) {
    // Standard HTTP header lets any future non-chat consumer honor the
    // backoff without parsing the JSON body.
    res.setHeader('Retry-After', Math.ceil(denial.retryAfter));
  }
  return res.status(statusCode).json({
    error: 'chat_limit_exceeded',
    reason: denial.reason,
    message: denial.message,
    retryAfter: denial.retryAfter ?? null,
    resetAt: denial.resetAt ? denial.resetAt.toISOString() : null,
    currentPlan: getPlanForUser(user).id,
    upgradeAvailable: Boolean(upgradePlanId),
    upgradePlanId,
    limit: denial.limit ?? null,
    used: denial.used ?? null,
  });
}

export async function requireChatQuota(req, res, next) {
  const rlog = req.log || log;
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'Not authenticated' });

  const features = getEffectivePlanFeatures(user);
  if (!features.chatAi) {
    return denyResponse(res, user, {
      reason: REASONS.FEATURE_DISABLED,
      message: 'AI chat is not included in your plan. Upgrade to start chatting with your data.',
    });
  }

  const limits = getEffectiveChatLimits(user);
  const windows = getQuotaWindows();

  let stats;
  try {
    stats = await aggregateUsage(user._id, windows);
  } catch (err) {
    rlog.error({ err: err.message }, 'chat-quota: aggregate failed');
    // Fail open: never block chat because telemetry query broke.
    req.chatLimits = limits;
    return next();
  }

  const denial = evaluateQuota({ limits, stats, windows });
  if (denial) {
    rlog.warn(
      { userId: String(user._id), reason: denial.reason, used: denial.used, limit: denial.limit },
      'chat-quota: denied',
    );
    return denyResponse(res, user, denial);
  }

  req.chatLimits = limits;
  next();
}

async function aggregateUsage(userId, windows) {
  const results = await ChatUsage.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        createdAt: { $gte: windows.startOfMonth },
      },
    },
    {
      $facet: {
        lastMinute: [
          { $match: { createdAt: { $gte: windows.minuteAgo } } },
          { $group: { _id: null, messages: { $sum: 1 } } },
        ],
        today: [
          { $match: { createdAt: { $gte: windows.startOfDay } } },
          {
            $group: {
              _id: null,
              messages: { $sum: 1 },
              inputTokens: { $sum: '$inputTokens' },
              outputTokens: { $sum: '$outputTokens' },
              costUsd: { $sum: '$totalCostUsd' },
            },
          },
        ],
        month: [
          { $group: { _id: null, costUsd: { $sum: '$totalCostUsd' } } },
        ],
      },
    },
  ]);

  const r = results[0] || {};
  const pickRow = (arr) => (Array.isArray(arr) && arr[0]) || {};
  return {
    lastMinute: { messages: pickRow(r.lastMinute).messages || 0 },
    today: {
      messages: pickRow(r.today).messages || 0,
      inputTokens: pickRow(r.today).inputTokens || 0,
      outputTokens: pickRow(r.today).outputTokens || 0,
      costUsd: pickRow(r.today).costUsd || 0,
    },
    month: { costUsd: pickRow(r.month).costUsd || 0 },
  };
}

function evaluateQuota({ limits, stats, windows }) {
  // Order matters: short-window first so users who just hammered get a
  // "try again in a minute" instead of a day/month cap message.
  if (stats.lastMinute.messages >= limits.messagesPerMinute) {
    return {
      reason: REASONS.PER_MINUTE,
      message: `You're sending messages too fast. Try again ${formatRelative(60)}.`,
      retryAfter: 60,
      resetAt: new Date(windows.now.getTime() + 60_000),
      limit: limits.messagesPerMinute,
      used: stats.lastMinute.messages,
    };
  }

  const dayRetrySec =
    (windows.startOfTomorrow.getTime() - windows.now.getTime()) / 1000;
  const monthRetrySec =
    (windows.startOfNextMonth.getTime() - windows.now.getTime()) / 1000;

  if (stats.today.messages >= limits.messagesPerDay) {
    return {
      reason: REASONS.DAILY_MESSAGES,
      message: `You've hit your daily message limit (${limits.messagesPerDay}). Resets ${formatRelative(dayRetrySec)}.`,
      retryAfter: dayRetrySec,
      resetAt: windows.startOfTomorrow,
      limit: limits.messagesPerDay,
      used: stats.today.messages,
    };
  }

  if (stats.today.inputTokens >= limits.inputTokensPerDay) {
    return {
      reason: REASONS.DAILY_INPUT_TOKENS,
      message: `You've used today's AI input budget. Resets ${formatRelative(dayRetrySec)}.`,
      retryAfter: dayRetrySec,
      resetAt: windows.startOfTomorrow,
      limit: limits.inputTokensPerDay,
      used: stats.today.inputTokens,
    };
  }

  if (stats.today.outputTokens >= limits.outputTokensPerDay) {
    return {
      reason: REASONS.DAILY_OUTPUT_TOKENS,
      message: `You've used today's AI response budget. Resets ${formatRelative(dayRetrySec)}.`,
      retryAfter: dayRetrySec,
      resetAt: windows.startOfTomorrow,
      limit: limits.outputTokensPerDay,
      used: stats.today.outputTokens,
    };
  }

  if (stats.today.costUsd >= limits.costUsdPerDay) {
    return {
      reason: REASONS.DAILY_COST,
      message: `You've used today's AI coach budget (${formatUsd(limits.costUsdPerDay)}). Resets ${formatRelative(dayRetrySec)}.`,
      retryAfter: dayRetrySec,
      resetAt: windows.startOfTomorrow,
      limit: limits.costUsdPerDay,
      used: stats.today.costUsd,
    };
  }

  if (stats.month.costUsd >= limits.costUsdPerMonth) {
    return {
      reason: REASONS.MONTHLY_COST,
      message: `You've used this month's AI coach budget (${formatUsd(limits.costUsdPerMonth)}). Resets ${formatRelative(monthRetrySec)}.`,
      retryAfter: monthRetrySec,
      resetAt: windows.startOfNextMonth,
      limit: limits.costUsdPerMonth,
      used: stats.month.costUsd,
    };
  }

  return null;
}

export { REASONS as CHAT_QUOTA_REASONS };
