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
