import getDb from "@/lib/db";

interface AiConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
}

export function getAiConfig(userId?: string): AiConfig {
  const defaults: AiConfig = {
    apiUrl: process.env.LITELLM_API_URL || "http://localhost:4000",
    apiKey: process.env.LITELLM_API_KEY || "",
    model: process.env.DEFAULT_MODEL || "gpt-4o",
  };

  if (userId) {
    try {
      const db = getDb();
      const settings = db
        .prepare("SELECT * FROM user_settings WHERE user_id = ?")
        .get(userId) as
        | { api_url: string; api_key: string; preferred_model: string }
        | undefined;

      if (settings) {
        if (settings.api_url) defaults.apiUrl = settings.api_url;
        if (settings.api_key) defaults.apiKey = settings.api_key;
        if (settings.preferred_model) defaults.model = settings.preferred_model;
      }
    } catch {
      // Use defaults on error
    }
  }

  return defaults;
}

export interface ProfileData {
  name: string;
  age?: number;
  gender?: string;
  height_cm?: number;
  weight_kg?: number;
  activity_level?: string;
  dietary_preference?: string;
  medical_conditions?: string[];
  allergies?: string[];
  medications?: string[];
  goals?: string[];
  additional_notes?: string;
}

export function buildProfileContext(profile: ProfileData): string {
  const parts: string[] = [];
  parts.push(`**Name:** ${profile.name}`);
  if (profile.age) parts.push(`**Age:** ${profile.age} years`);
  if (profile.gender) parts.push(`**Gender:** ${profile.gender}`);
  if (profile.height_cm) parts.push(`**Height:** ${profile.height_cm} cm`);
  if (profile.weight_kg) parts.push(`**Weight:** ${profile.weight_kg} kg`);
  if (profile.height_cm && profile.weight_kg) {
    const bmi = profile.weight_kg / ((profile.height_cm / 100) ** 2);
    parts.push(`**BMI:** ${bmi.toFixed(1)}`);
  }
  if (profile.activity_level)
    parts.push(`**Activity Level:** ${profile.activity_level.replace(/_/g, " ")}`);
  if (profile.dietary_preference)
    parts.push(`**Dietary Preference:** ${profile.dietary_preference.replace(/_/g, " ")}`);
  if (profile.medical_conditions?.length)
    parts.push(`**Medical Conditions:** ${profile.medical_conditions.join(", ")}`);
  if (profile.allergies?.length)
    parts.push(`**Allergies:** ${profile.allergies.join(", ")}`);
  if (profile.medications?.length)
    parts.push(`**Current Medications:** ${profile.medications.join(", ")}`);
  if (profile.goals?.length)
    parts.push(`**Health Goals:** ${profile.goals.join(", ")}`);
  if (profile.additional_notes)
    parts.push(`**Additional Notes:** ${profile.additional_notes}`);

  return parts.join("\n");
}

export function buildSystemPrompt(profile: ProfileData): string {
  return `You are HealthForge AI — a knowledgeable, evidence-based health and lifestyle advisor.

## Your Role
- You provide personalized health, nutrition, exercise, and lifestyle recommendations.
- All your advice MUST be grounded in well-established scientific evidence and current medical guidelines (WHO, NIH, AHA, etc.)
- You always consider the individual's specific health profile including medical conditions, medications, and allergies.
- When relevant, cite the type of evidence (e.g., "meta-analyses show…", "randomized controlled trials suggest…").

## Health Profile You Are Advising
${buildProfileContext(profile)}

## Critical Rules
1. **Safety First**: Never recommend anything that could interact badly with existing medical conditions or medications.
2. **Age-Appropriate**: Tailor all advice to the person's age group (pediatric, adult, geriatric).
3. **Medical Disclaimer**: Remind users to consult their healthcare provider before making significant changes to diet, exercise, or medications.
4. **No Diagnosis**: Never diagnose conditions. Suggest professional consultation when symptoms are described.
5. **Practical & Actionable**: Give specific, actionable recommendations (exact foods, portions, exercise routines with sets/reps, sleep hygiene steps).
6. **Cultural Sensitivity**: Respect dietary preferences and cultural practices.
7. **Use Markdown**: Format responses with clear headings, bullet points, and sections for readability.`;
}

export function buildPlanPrompt(
  profile: ProfileData,
  planType: string,
  focusAreas: string[]
): string {
  const duration = planType === "monthly" ? "30-day" : planType === "custom" ? "personalized" : "7-day";
  const areas = focusAreas.length > 0 ? focusAreas.join(", ") : "diet, exercise, sleep, stress management, supplements";

  return `Generate a comprehensive, personalized ${duration} health and lifestyle plan.

## Focus Areas: ${areas}

## Required Plan Structure
For each day/week, provide SPECIFIC and ACTIONABLE recommendations organized in these sections:

### 🍽️ Nutrition Plan
- Specific meals with portions (breakfast, lunch, dinner, snacks)
- Caloric targets and macronutrient breakdown
- Foods to emphasize and avoid given medical conditions
- Hydration goals

### 🏋️ Exercise Plan  
- Specific exercises with sets, reps, and duration
- Warm-up and cool-down routines
- Rest day scheduling
- Intensity modifications based on fitness level

### 😴 Sleep & Recovery
- Sleep schedule recommendations
- Sleep hygiene practices
- Recovery strategies

### 🧘 Stress Management & Mental Wellness
- Mindfulness/meditation suggestions
- Stress reduction techniques
- Social connection recommendations

### 💊 Supplement Considerations
- Evidence-based supplement suggestions (with dosages)
- Interactions with current medications to watch for
- Timing recommendations

### ⚠️ Important Precautions
- Activity modifications for medical conditions
- Warning signs to watch for
- When to consult a healthcare provider

Make the plan progressive (gradually increasing intensity/complexity).
Use markdown formatting with clear headers and organized sections.
Be specific — no vague advice like "eat healthy." Give exact foods, exact exercises, exact timings.`;
}

export async function streamChat(
  config: AiConfig,
  messages: { role: string; content: string }[]
): Promise<ReadableStream> {
  const response = await fetch(`${config.apiUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      stream: true,
      temperature: 0.7,
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`LLM API error (${response.status}): ${errText}`);
  }

  if (!response.body) {
    throw new Error("No response body from LLM API");
  }

  return response.body;
}

export async function generateCompletion(
  config: AiConfig,
  messages: { role: string; content: string }[]
): Promise<string> {
  const response = await fetch(`${config.apiUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: 0.7,
      max_tokens: 8192,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`LLM API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

// ═══════════════════════════════════════════
// GROUP / MULTI-PROFILE AI PROMPTS
// ═══════════════════════════════════════════

export function buildGroupSystemPrompt(profiles: ProfileData[]): string {
  const memberContexts = profiles
    .map((p, i) => `### Member ${i + 1}\n${buildProfileContext(p)}`)
    .join("\n\n");

  return `You are HealthForge AI — a knowledgeable, evidence-based health and lifestyle advisor for GROUPS of people.

## Your Role
- You provide personalized health, nutrition, exercise, and lifestyle recommendations for a GROUP of individuals simultaneously.
- All advice MUST be grounded in well-established scientific evidence and current medical guidelines.
- You MUST consider EVERY member's specific health profile including medical conditions, medications, and allergies.
- When there are conflicts between members' needs (e.g., one diabetic, one needs high-carb), you MUST:
  1. ⚠️ Flag the conflict clearly with a warning
  2. Propose a compromise that works for everyone
  3. Provide per-member modifications where a shared approach isn't possible

## Group Members
${memberContexts}

## Critical Rules
1. **Safety First**: Never recommend anything that could harm ANY member. Check all medications and conditions.
2. **Age-Appropriate**: Account for the age range of all members (children vs adults vs elderly).
3. **Allergy Union**: The plan must avoid ALL allergens across ALL members unless specifically modified per-member.
4. **Medical Disclaimer**: Remind users to consult healthcare providers.
5. **Per-Member Callouts**: After shared recommendations, add specific modifications for members who need exceptions.
6. **Use Markdown**: Format with clear headings, member-specific sections, and ⚠️ warnings for conflicts.`;
}

export function buildGroupPlanPrompt(
  profiles: ProfileData[],
  groupType: string,
  groupGoals: string[],
  focusAreas: string[]
): string {
  const duration = "7-day";
  const areas = focusAreas.length > 0 ? focusAreas.join(", ") : "diet, exercise, sleep, stress management";
  const goals = groupGoals.length > 0 ? groupGoals.join(", ") : "overall family wellness";
  const memberNames = profiles.map((p) => p.name).join(", ");

  const typeLabel: Record<string, string> = {
    family_meal: "Family Meal Plan",
    workout: "Group Workout Plan",
    wellness: "Wellness Challenge",
    custom: "Custom Group Plan",
  };

  return `Generate a comprehensive ${duration} **${typeLabel[groupType] || "Group Health Plan"}** for: ${memberNames}.

## Group Goals: ${goals}
## Focus Areas: ${areas}

## Required Structure

### ⚠️ Conflict Analysis
First, analyze the group and identify any conflicts between members' health needs (dietary restrictions, medical conditions, activity levels, age differences). Flag each conflict with a ⚠️ warning and explain how you'll handle it.

### 📋 Shared Plan
Generate a plan that works for ALL members. For each day, provide:

#### 🍽️ Shared Meals
- Specific meals with portions that respect ALL allergies and dietary needs
- Base meals that everyone can eat together
- Mark any per-member modifications clearly

#### 🏋️ Group Activities
- Exercises the group can do together
- Intensity levels appropriate for the youngest/oldest/least fit member
- Optional intensity boosters for fitter members

#### 😴 Shared Schedule
- Wake/sleep times, meal times, activity times
- Consider different age groups (kids' bedtimes vs adults)

### 👤 Per-Member Modifications
For EACH member who needs exceptions from the shared plan, provide a dedicated section with:
- What they should add/remove/modify from the shared meals
- Exercise intensity adjustments
- Supplement recommendations specific to their conditions
- Any medication timing considerations

### ⚠️ Safety Warnings
- Medication interactions to watch for
- Activity restrictions per member
- When to consult a healthcare provider

Be SPECIFIC — exact foods, exact exercises, exact timings. No vague advice.
Use markdown formatting with clear headers and organized sections.`;
}

export function buildDailySummaryPrompt(planContent: string, dayOfWeek: string): string {
  return `Based on this health plan, generate a brief, friendly WhatsApp-style daily summary for ${dayOfWeek}. Keep it under 500 characters. Use emojis. Include the key meals, exercises, and reminders for today only.

Plan:
${planContent.substring(0, 3000)}

Format as a short, motivational message with bullet points. Start with a greeting.`;
}

export function buildBulkMessagesPrompt(
  planContent: string,
  recipientName: string,
  days: number,
  customContext?: string
): string {
  return `You are a health coach assistant. Based on the health plan below, generate exactly ${days} unique daily WhatsApp reminder messages for ${recipientName}.

Each message should:
- Be friendly, motivational, and personal
- Reference specific items from the health plan (real foods, exercises, etc.)
- Be concise (under 400 characters each)
- Use relevant emojis
- Feel different each day — vary the tone, focus area, and content
- Start with a greeting mentioning the day or a motivational phrase
${customContext ? `\nAdditional context/instructions: ${customContext}` : ""}

Health Plan:
${planContent.substring(0, 4000)}

IMPORTANT: Return ONLY a valid JSON array of exactly ${days} strings. No markdown, no explanation, just the raw JSON array.
Example format: ["Message 1 text here", "Message 2 text here", ...]`;
}

export function buildPlanItemQueuePrompt(
  planContent: string,
  recipientName: string,
  days: number,
  customContext?: string
): string {
  return `You are a health plan scheduling assistant.

Goal:
- Read the health plan and extract ALL actionable plan items for the first ${days} day(s).
- Generate WhatsApp-ready queue entries for ${recipientName}.

Rules:
- Include every actionable item (meals, workouts, hydration, medication reminders, sleep/wind-down, etc.) for day 1..${days}.
- If a plan item has a time, preserve it.
- If a plan item has no explicit time, assign a practical local time.
- Keep each message concise (under 400 chars), clear, and specific about what to do at that time.
- Use 24-hour HH:MM format for "time".
- Return only unique and meaningful reminders (no duplicates).
${customContext ? `\nAdditional context/instructions: ${customContext}` : ""}

Health Plan:
${planContent.substring(0, 5000)}

Output format:
Return ONLY valid JSON as an array of objects with this exact schema:
[
  { "day_offset": 0, "time": "07:30", "message_text": "..." },
  { "day_offset": 0, "time": "12:45", "message_text": "..." }
]

Constraints:
- day_offset is an integer from 0 to ${Math.max(0, days - 1)}.
- time must be a valid HH:MM 24-hour string.
- Do not include markdown or explanation outside the JSON array.`;
}

export function buildManualFrequencyQueuePrompt(
  planContent: string,
  recipientName: string,
  days: number,
  messagesPerDay: number,
  customContext?: string
): string {
  const total = days * messagesPerDay;
  return `You are a health coaching scheduler assistant.

Goal:
- Design exactly ${total} queued WhatsApp reminders for ${recipientName} over ${days} day(s).
- Schedule exactly ${messagesPerDay} reminders per day.

Rules:
- Use the health plan as the source of tasks/advice.
- Create reminders that are actionable, specific, and varied.
- AI should choose the best timestamp for each reminder.
- Use 24-hour HH:MM format for "time".
- Keep message_text under 400 characters.
${customContext ? `\nAdditional context/instructions: ${customContext}` : ""}

Health Plan:
${planContent.substring(0, 5000)}

Output format:
Return ONLY valid JSON as an array of objects with this exact schema:
[
  { "day_offset": 0, "time": "08:15", "message_text": "..." },
  { "day_offset": 0, "time": "18:45", "message_text": "..." }
]

Constraints:
- Exactly ${total} objects total.
- Exactly ${messagesPerDay} objects for each day_offset.
- day_offset must be an integer from 0 to ${Math.max(0, days - 1)}.
- time must be a valid HH:MM 24-hour string.
- Do not include markdown or explanation outside the JSON array.`;
}
