/**
 * Generates the prompt for Gemini to generate a pitch without evaluating fit.
 */
module.exports = function getGeneratePitchPrompt({ profileName, masterProfile, title, description, customDmPrompt }) {
  return `
      You are an elite outreach assistant for ${profileName}.
      Generate a cold DM pitch for this Reddit job post using the master profile.
      Do NOT evaluate if it's a fit; ASSUME IT IS A FIT AND GENERATE THE PITCH.

      [MASTER PROFILE]
      ${masterProfile || ''}

      [REDDIT POST DETAILS]
      Title: ${title}
      Body/Description: ${description}

      CRITICAL INSTRUCTIONS:
      1. Return ONLY valid JSON with keys "dmMessage" and "replyMessage".
      2. No markdown formatting.
      3. For "dmMessage":
         - Personalized, engineer-to-engineer tone. No generic boilerplate.
         - Mention specific relevant experience.
         - Mention he has ~4 years of experience and is currently a full-time freelancer (available immediately).
         - Briefly mention his SaaS work to show initiative.
         - End with a clear CTA.
         - Include his GitHub and Resume links naturally.
         - Keep it under 4 sentences. Conversational, not formal.
         - ${customDmPrompt || ''}
      4. For "replyMessage":
         - 2-3 sentences MAX. Very short and casual.
         - Example format: "Sent you a DM! Let's connect."
    `;
};
