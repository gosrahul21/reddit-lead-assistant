/**
 * Generates the prompt for Gemini to evaluate a Reddit job post.
 * 
 * ==========================================
 * EXAMPLE USAGE / PROMPT PREVIEW
 * ==========================================
 * 
 * const prompt = getEvaluatePostPrompt({
 *   profileName: 'Rahul',
 *   masterProfile: 'Name: Rahul\nRole: Full Stack Engineer\nExperience: 4 years...',
 *   title: 'Hiring React Developer',
 *   description: 'Looking for a dev with 3+ years of experience in React and Node.js.',
 *   customDmPrompt: 'Please mention my recent SaaS project.'
 * });
 * 
 * // The generated prompt will look like this:
 * //
 * // You are an elite outreach assistant for Rahul.
 * // Analyze this Reddit job post against the provided master profile to determine if it's a strong hiring fit.
 * //
 * // [MASTER PROFILE]
 * // Name: Rahul
 * // Role: Full Stack Engineer
 * // Experience: 4 years...
 * //
 * // [REDDIT POST DETAILS]
 * // Title: Hiring React Developer
 * // Body/Description: Looking for a dev with 3+ years of experience in React and Node.js.
 * // 
 * // CRITICAL INSTRUCTIONS:
 * // 1. If this post is NOT someone explicitly looking to hire/contract a developer, reply ONLY with JSON: {"skip": true}
 * // 2. If it is a strong fit, reply with a JSON object containing "dmMessage" and "replyMessage".
 * // ...
 */

module.exports = function getEvaluatePostPrompt({ profileName, masterProfile, title, description, customDmPrompt }) {
  return `
      You are an elite outreach assistant for ${profileName}.
      Analyze this Reddit job post against the provided master profile to determine if it's a strong hiring fit.

      [MASTER PROFILE]
      ${masterProfile || ''}

      [REDDIT POST DETAILS]
      Title: ${title}
      Body/Description: ${description}

      CRITICAL INSTRUCTIONS:
      1. If this post is NOT someone explicitly looking to hire/contract a developer, reply ONLY with JSON: {"skip": true}
      2. If it is a strong fit, reply with a JSON object containing "dmMessage" and "replyMessage".

      For "dmMessage":
      - Personalized, engineer-to-engineer tone. No generic boilerplate.
      - Mention specific relevant experience matching the post (e.g. Kafka, Redis, WebSockets, AI, blockchain, etc.)
      - Mention he has ~4 years of experience and is currently a full-time freelancer (available immediately)
      - Briefly mention his SaaS work to show initiative
      - End with a clear CTA (e.g. "Let's me know if you want to know more about me")
      - Include his GitHub and Resume, linkedin, portfolio, youtube link links naturally
      - Keep it under 4 sentences. Conversational, not formal.
      - ${customDmPrompt || ''}

      For "replyMessage":
      - 2-3 sentences MAX. Very short and casual.
      - Example format: "Sent you a DM! Let's connect."
      - Do NOT include links in the reply message.

      Return ONLY valid JSON with keys "dmMessage" and "replyMessage". No markdown formatting.

      [EXAMPLE RESPONSE (STRONG FIT)]
      {
        "dmMessage": "Hey! Saw you're looking for a React dev. I have ~4 years of experience and am currently a full-time freelancer so I can jump in immediately. I recently built a similar SaaS tool using React and Node.js. Check out my GitHub (link) and Resume (link). Let me know if you want to chat!",
        "replyMessage": "Sent you a DM! Let's connect."
      }

      [EXAMPLE RESPONSE (NOT A FIT)]
      {
        "skip": true
      }
    `;
};
