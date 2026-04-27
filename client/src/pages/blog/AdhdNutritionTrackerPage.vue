<script setup>
import BlogArticle from '../../components/BlogArticle.vue';
import { useRouteSeo } from '../../composables/useSeo.js';
useRouteSeo();
</script>

<template>
  <BlogArticle
    eyebrow="ADHD · Tracking"
    title="The Atomic Habits Lie:|Why ADHD Brains Need a Different Kind of Tracker."
    accent="A Different Kind of Tracker."
    date="2026-04-27"
    read-time="8 min read"
  >
    <p>Every morning for years, I would open MyFitnessPal, tap the search box, type the word "banana," wait for the results, scroll past forty almost-identical entries, pick the one labeled "Banana, raw, medium, 1 each, 105 cal," and tap log. The next morning, I would do it again. The morning after that, I would do it again.</p>

    <p>I eat a banana every morning. The app knew this — it was right there in the history. And every single day, it made me prove it from scratch.</p>

    <p>I'm a software developer with ADHD, inattentive type, diagnosed in my late thirties. I've been overweight my entire adult life. I have started and abandoned MyFitnessPal at least five separate times. The pattern is identical every time: a couple of weeks of clean compliance, a sloppy week, total abandonment, eight months of vague guilt, sheepish reinstall. I used to think that was a discipline problem. It isn't. The app is structurally hostile to the way my brain works, and I'm pretty sure it's hostile to a lot of other people's brains too.</p>

    <h2>It's just a notebook</h2>

    <p>The deeper failure of MyFitnessPal — bigger than the banana ritual — is that it gave me nothing back. I would feed it everything: my weight, my macros, the brand of yogurt, the volume of milk, the exact piece of toast. And it would just sit there. It never explained why my weight bounced four pounds overnight. It never told me what my basal metabolic rate was actually doing. It never connected a stressful Tuesday to a 9pm fridge raid. It never explained anything about the body I was logging into it.</p>

    <p>It was a notebook with a calorie database. That's it. And I was paying twenty dollars a month for it.</p>

    <p>What I actually wanted — what most people who get into tracking actually want — is to understand the thing they're walking around in. Why a salty meal puts a pound on the scale overnight. Why the scale goes the wrong direction the morning after a hard workout. Why a low-appetite day on a GLP-1 isn't a "win." None of those questions had answers in the app. The app didn't even pretend to engage with them. So every act of logging felt like depositing data into a black hole.</p>

    <p>For an ADHD brain, "effort in, nothing out" is corrosive. Our reward system is the thing that's broken to begin with. Routinely throwing effort at a system that returns zero insight is exactly how habits unbuild themselves.</p>

    <h2>The atomic habits lie</h2>

    <p>If you have ADHD, someone has handed you <em>Atomic Habits</em>. The pitch is simple and seductive: don't try to overhaul your life. Make one tiny change, do it every day, stack a second tiny change on top, repeat. After a year, you're a different person.</p>

    <p>This advice is wrong for ADHD brains. Not "harder for" — wrong. The atomic-habits model assumes you will remember a small new thing, every day, indefinitely. The exact failure mode of ADHD is not remembering small new things. We forget to eat. We forget to take the medication that helps us not forget things. We forget appointments we made yesterday. The cognitive load of "do this small new thing every day, and oh by the way also this other small new thing, and also this third one" is the load that crushes us specifically.</p>

    <p>What has actually worked for me — and I want to say this loudly because every neurotypical productivity guru would tell me it's the wrong approach — is to do everything at once. New diet, new sleep schedule, new workout, new commute, new supplement stack, new wind-down routine. All on the same Monday. All as a single project.</p>

    <p>It works because the project itself becomes the focus. You can't forget you're doing a major life overhaul. You're aware of it the moment you wake up. The ADHD attention can lock onto the project, and that hyperfocus is what carries the new behaviors past the point where they become baseline. By the time the novelty wears off, the new sleep schedule and the new diet and the new gym routine are just what your week looks like. I've kept mine running for months — not because I have unusual willpower, but because I leveraged the one cognitive feature I do have plenty of: the capacity for total, project-shaped attention.</p>

    <p>Daily macro tracking, layered onto an unchanged life, is the atomic-habits version of a habit. It's a small new thing you have to remember to do, multiple times a day, indefinitely. That's the exact shape of behavior the ADHD brain cannot sustain. Not won't — cannot. It's not a willpower problem. It's a brain-architecture problem.</p>

    <h2>Why daily logging structurally fails the ADHD brain</h2>

    <p>If you stack the failure modes, the abandonment cliff stops looking like a personal flaw and starts looking like an inevitable system output:</p>

    <ul>
      <li><strong>Repetitive low-value work.</strong> Re-typing "banana" every morning. The brain registers it as wasted effort, because it is wasted effort. Motivation drains.</li>
      <li><strong>Decision fatigue per meal.</strong> Forty database entries for "banana." Which is the verified one? Which has the right calories? Did I pick the same one yesterday? Each choice depletes the executive function we already have less of.</li>
      <li><strong>No payoff loop.</strong> The app takes data and gives back nothing the user actually wants — no insight, no model of the body, no education. The reward circuit doesn't fire. Day two starts with motivation already depleted.</li>
      <li><strong>Daily tax indefinitely.</strong> Even on a perfect week, you pay the tax three to five times a day, every day. The system never gets easier with use.</li>
      <li><strong>Failure punishments.</strong> Miss a day and the streak breaks, the daily target turns red, the app sends a passive-aggressive notification. Rejection-sensitive dysphoria is a common ADHD comorbidity. This is corrosive, not motivating.</li>
    </ul>

    <p>That's the pattern I lived five times. Enthusiastic start, sloppy week two, abandoned by week three. The trackers will tell you the issue is consistency. The issue is the system. They built it for a brain that consistently does one small thing per day. That brain isn't mine, and I think it isn't most of yours either.</p>

    <h2>What "ADHD-friendly" actually has to mean</h2>

    <p>If you accept the structural argument, the principles for what would actually work fall out of it. None of these are "be easier" — they're concrete:</p>

    <ol>
      <li><strong>Logging has to be near-zero friction.</strong> A photo of the plate, a sentence into the microphone, one tap to repeat yesterday's breakfast. If logging takes more than a few seconds and any meaningful executive function, abandonment is the structural endpoint.</li>
      <li><strong>The system has to give something back.</strong> Every act of logging needs to feed an insight loop the user actually wants. What's my trend line doing? Why did the scale jump? Where am I on my dose curve? When data flows in and information flows out, the work feels worth doing.</li>
      <li><strong>It has to handle physiologically uneven days.</strong> On a GLP-1, appetite varies dramatically across the week. A tracker that flags a 900-calorie low-appetite day as a "failure" is using a model of the body that doesn't match my body. I've written separately about <a href="/blog/weekly-calorie-budget-for-glp1">why calories should roll across the week</a>; the whole framework comes from this constraint.</li>
      <li><strong>It has to teach.</strong> Why your weight fluctuates day to day. Why a high-sodium dinner is not a four-pound fat gain. Why a 1.6 g/kg protein floor matters more than a calorie target. The user's relationship with their body should improve over time. If it doesn't, the data is being wasted.</li>
      <li><strong>It has to fail gracefully.</strong> Skipped a day? Logged sloppy estimates? Missed a weigh-in? The system shouldn't punish — it should regress to the trend, fill in what it can, and not break a streak. ADHD users abandon over guilt as much as over friction.</li>
    </ol>

    <h2>What I built instead</h2>

    <p>I've been writing software professionally for over twenty years. Last year, while rebuilding my own protocol from scratch, I started an open-source physiology simulator to model how supplements, light, exercise, and peptides shift endogenous signals — cortisol, dopamine, vasopressin, the works. That project taught me pharmacokinetics by force, because I had to model it to see anything useful. When I started a GLP-1 protocol earlier this year and signed up for a clinical trial that requires a meticulous food and symptom diary, I knew immediately that no existing tracker was going to survive contact with my brain.</p>

    <p>So I built one. I'm using it on myself every day. The principles above aren't theory; they're the spec. Photo logging instead of database search. Voice notes instead of typing. Rolling weekly budgets instead of midnight resets. Trend regression instead of raw scale anxiety. Pharmacokinetic curves instead of "you took your dose." Coaching that knows what day of the injection cycle I'm on before it tells me anything.</p>

    <p>Every feature exists because I, specifically, would have abandoned the app without it. That turned out to be the only design principle that scaled.</p>

    <p>If your tracking history looks like mine — months of compliance, sudden cliff, eight months of guilt, sheepish reinstall — the issue probably isn't your discipline. The issue is that you've been handed a tool built for a brain that isn't yours.</p>

    <template #cta>
      <a href="/features">See how Protokol Lab does it</a>
    </template>
  </BlogArticle>
</template>
