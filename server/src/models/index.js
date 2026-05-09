// Barrel module: importing this registers every Mongoose model so that
// `mongoose.model('Name')` works regardless of which routes have loaded.
//
// The User cascade hook resolves model classes by string name; tests, scripts,
// and one-off jobs that don't import the full route surface need this so the
// cascade can find every userId-referencing collection.

import ChatThread from './ChatThread.js';
import ChatUsage from './ChatUsage.js';
import Compound from './Compound.js';
import DayNote from './DayNote.js';
import DoseLog from './DoseLog.js';
import FastingEvent from './FastingEvent.js';
import FavoriteFood from './FavoriteFood.js';
import FeatureRequest from './FeatureRequest.js';
import FoodItem from './FoodItem.js';
import FoodLog from './FoodLog.js';
import FunnelEvent from './FunnelEvent.js';
import Meal from './Meal.js';
import MealProposal from './MealProposal.js';
import BloodworkProposal from './BloodworkProposal.js';
import Exercise from './Exercise.js';
import ExerciseLog from './ExerciseLog.js';
import DayStatus from './DayStatus.js';
import Metric from './Metric.js';
import MetricLog from './MetricLog.js';
import Photo from './Photo.js';
import PhotoType from './PhotoType.js';
import PushSubscription from './PushSubscription.js';
import RecentFood from './RecentFood.js';
import SupportTicket from './SupportTicket.js';
import Symptom from './Symptom.js';
import SymptomLog from './SymptomLog.js';
import User from './User.js';
import UserSettings from './UserSettings.js';
import WaterLog from './WaterLog.js';
import WeightLog from './WeightLog.js';

export {
  ChatThread, ChatUsage, Compound, DayNote, DoseLog,
  FastingEvent, FavoriteFood, FeatureRequest, FoodItem, FoodLog,
  FunnelEvent, Meal, MealProposal, BloodworkProposal, Exercise, ExerciseLog, DayStatus, Metric, MetricLog, Photo, PhotoType, PushSubscription,
  RecentFood, SupportTicket, Symptom, SymptomLog,
  User, UserSettings, WaterLog, WeightLog,
};
