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

const FOCUS_AREA_SECTION_MAP: Record<string, { title: string; requirements: string[] }> = {
  "🍽️ Diet & Nutrition": {
    title: "Nutrition Plan",
    requirements: [
      "Specific meals with portions (breakfast, lunch, dinner, snacks)",
      "Caloric targets and macronutrient breakdown when relevant",
      "Foods to emphasize and avoid given medical conditions",
      "Exact meal timings when useful",
    ],
  },
  "🏋️ Exercise & Fitness": {
    title: "Exercise Plan",
    requirements: [
      "Specific exercises with sets, reps, duration, and intensity",
      "Warm-up and cool-down routines",
      "Rest day scheduling or recovery pairing when relevant",
      "Adjustments based on current fitness level or health conditions",
    ],
  },
  "😴 Sleep & Recovery": {
    title: "Sleep & Recovery",
    requirements: [
      "Sleep schedule recommendations",
      "Sleep hygiene practices",
      "Recovery strategies for workouts, fatigue, or stress",
    ],
  },
  "🧘 Stress Management": {
    title: "Stress Management",
    requirements: [
      "Specific stress reduction techniques",
      "Mindfulness, breathwork, or relaxation routines",
      "How often and when to do them",
    ],
  },
  "💊 Supplements": {
    title: "Supplement Considerations",
    requirements: [
      "Evidence-based supplement suggestions with dosages when appropriate",
      "Medication/condition interactions to watch for",
      "Exact timing recommendations",
    ],
  },
  "💧 Hydration": {
    title: "Hydration Plan",
    requirements: [
      "Daily fluid targets",
      "Timing guidance across the day",
      "Electrolyte or hydration adjustments when relevant",
      "Exact drink quantity guidance, not generic reminders",
    ],
  },
  "🧠 Mental Wellness": {
    title: "Mental Wellness",
    requirements: [
      "Daily mental wellness habits",
      "Mood-supportive routines and reflection prompts",
      "Practical frequency and timing guidance",
    ],
  },
  "❤️ Heart Health": {
    title: "Heart Health",
    requirements: [
      "Heart-supportive meals, movement, and recovery guidance",
      "Blood pressure/cholesterol friendly choices when relevant",
      "Safety precautions and progression guidance",
    ],
  },
};

function getSelectedFocusAreaSpecs(focusAreas: string[]): { title: string; requirements: string[] }[] {
  const selected = focusAreas
    .map((area) => FOCUS_AREA_SECTION_MAP[area])
    .filter(Boolean);

  if (selected.length > 0) {
    return selected;
  }

  return Object.values(FOCUS_AREA_SECTION_MAP);
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
  const areas = focusAreas.length > 0 ? focusAreas.join(", ") : Object.keys(FOCUS_AREA_SECTION_MAP).join(", ");
  const sections = getSelectedFocusAreaSpecs(focusAreas)
    .map((section) => `### ${section.title}\n${section.requirements.map((req) => `- ${req}`).join("\n")}`)
    .join("\n\n");

  return `Generate a comprehensive, personalized ${duration} health and lifestyle plan.

## Focus Areas: ${areas}

## Important Scope Rule
- ONLY include content for the selected focus areas.
- DO NOT include extra sections for unselected focus areas.
- If only one area is selected (for example Hydration), the entire output must stay within that area plus safety notes.

## Required Plan Structure
For each day/week, provide SPECIFIC and ACTIONABLE recommendations organized only in the selected sections below:

${sections}

### Important Precautions
- Include only safety notes that are directly relevant to the selected focus areas
- Mention when to consult a healthcare provider
- Call out medication or condition interactions only when relevant to the selected areas

Make the plan progressive when appropriate.
Use markdown formatting with clear headers and organized sections.
Be specific — no vague advice like "eat healthy." Give exact foods, exact exercises, exact timings, and exact quantities where relevant.`;
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
  const areas = focusAreas.length > 0 ? focusAreas.join(", ") : Object.keys(FOCUS_AREA_SECTION_MAP).join(", ");
  const goals = groupGoals.length > 0 ? groupGoals.join(", ") : "overall family wellness";
  const memberNames = profiles.map((p) => p.name).join(", ");
  const selectedSections = getSelectedFocusAreaSpecs(focusAreas)
    .map((section) => `#### ${section.title}\n${section.requirements.map((req) => `- ${req}`).join("\n")}`)
    .join("\n\n");

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

### Scope Rule
- ONLY include recommendations for the selected focus areas.
- DO NOT add extra sections outside those areas.

### 📋 Shared Plan
Generate a plan that works for ALL members. For each day, provide:

${selectedSections}

### 👤 Per-Member Modifications
For EACH member who needs exceptions from the shared plan, provide a dedicated section with:
- Only modifications that are relevant to the selected focus areas
- Exact quantities, timing, and substitutions where needed

### ⚠️ Safety Warnings
- Only safety warnings relevant to the selected focus areas
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
  options: {
    planTitle?: string;
    planId?: string;
    focusAreas?: string[];
    startDate?: string;
    daysMode: "auto" | "manual";
    days?: number;
    frequencyMode: "auto" | "manual";
    messagesPerDay?: number;
  },
  customContext?: string
): string {
  const areaText = options.focusAreas?.length ? options.focusAreas.join(", ") : "all focus areas in the selected plan";
  const daysInstruction = options.daysMode === "manual"
    ? `Generate queue entries for exactly ${options.days} plan day(s), beginning with day 1 of the selected plan.`
    : "Infer how many plan day(s) should be queued from the selected plan structure, beginning with day 1 of the selected plan.";
  const frequencyInstruction = options.frequencyMode === "manual"
    ? `For each queued plan day, create exactly ${options.messagesPerDay} detailed action reminders plus one extra early-morning day-summary notification.`
    : "Infer the right number of detailed reminders per day from the plan, and also create one extra early-morning day-summary notification for each queued day.";

  return `You are a health plan scheduling assistant.

Goal:
- Read the selected health plan and generate WhatsApp-ready queue entries for ${recipientName}.
- Limit queue content to these focus areas only: ${areaText}.
- Plan title: ${options.planTitle || "Selected Plan"}.
- Plan ID: ${options.planId || "N/A"}.

Scheduling rules:
- ${daysInstruction}
- ${frequencyInstruction}
- The queue start calendar date is ${options.startDate || "the user-selected start date"}.

Rules:
- Use day_offset relative to the selected start calendar date. Day 1 of the plan must use day_offset 0.
- Include only actionable items that belong to the selected focus areas.
- The first notification for each queued day must be an early-morning summary of the full selected-focus-area plan for that day.
- If a plan item has a time, preserve it.
- If a plan item has no explicit time, assign a practical local time.
- Keep every message clear, specific, and operational.
- Preserve important detail like quantity, duration, sets/reps, meal portions, hydration volume, medication timing, or any other actionable amount.
- Include the plan title, short plan identifier, plan day number, and the scheduled time context directly in the message text.
- Use 24-hour HH:MM format for "time".
- Return only unique and meaningful reminders (no duplicates).
${customContext ? `\nAdditional context/instructions: ${customContext}` : ""}

Health Plan:
${planContent.substring(0, 5000)}

Output format:
Return ONLY valid JSON as an array of objects with this exact schema:
[
  { "day_offset": 0, "time": "06:30", "message_text": "..." },
  { "day_offset": 0, "time": "12:45", "message_text": "..." }
]

Constraints:
- day_offset must be a non-negative integer.
- time must be a valid HH:MM 24-hour string.
- Do not include markdown or explanation outside the JSON array.`;
}
