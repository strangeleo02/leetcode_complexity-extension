// background.js (No changes needed from original)

const GEMINI_API_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "analyzeCode") {
    console.log("Background: Received code analysis request.");
    // Get API key from storage
    chrome.storage.sync.get(['geminiApiKey'], async (result) => {
      const apiKey = result.geminiApiKey;
      if (!apiKey) {
        console.error("Background: Gemini API key not found in storage.");
        // Send error back to the caller (which is now popup.js)
        sendResponse({ error: "Gemini API key not set. Please set it in the extension popup." });
        return; // Exit early
      }

      const codeToAnalyze = request.code;
      if (!codeToAnalyze) {
        // Send error back to the caller
        sendResponse({ error: "No code provided in the request." });
        return;
      }

      // Construct the prompt for Gemini
      const prompt = `
Analyze the following code snippet and determine its Time Complexity and Space Complexity using Big O notation.
Provide a brief explanation for each. Format the output clearly, for example DO NOT GIVE ANYTHING ELSE ONLY GIVE IT'S COMPLEXITIY:

Time Complexity: O(N) 
Space Complexity: O(1)

--- Code ---
\`\`\`
${codeToAnalyze}
\`\`\`
--- Analysis ---
`;

      try {
        console.log("Background: Sending request to Gemini API...");
        const response = await fetch(`${GEMINI_API_ENDPOINT}?key=${apiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: prompt }]
            }],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 1000,
            }
          })
        });

        const data = await response.json();
        console.log("Background: Received response from Gemini API:", data);

        if (!response.ok) {
          // Handle API errors (e.g., invalid key, quota exceeded, server error)
          console.error("Gemini API Error:", data);
          const errorMessage = data.error?.message || `HTTP Error ${response.status}: ${response.statusText}`;
          // Send error back to the caller
          sendResponse({ error: `Gemini API Error: ${errorMessage}`, details: data });
          return;
        }

        // Extract the text content from the response
        if (data.candidates && data.candidates.length > 0 &&
            data.candidates[0].content &&
            data.candidates[0].content.parts &&
            data.candidates[0].content.parts.length > 0) {
          const analysisText = data.candidates[0].content.parts[0].text;
          console.log("Background: Extracted analysis:", analysisText);
          // Send successful analysis back to the caller
          sendResponse({ analysis: analysisText });
        } else if (data.candidates && data.candidates.length > 0 && data.candidates[0].finishReason) {
          // Handle cases where generation finished for other reasons (e.g., SAFETY)
          console.warn("Gemini generation finished with reason:", data.candidates[0].finishReason);
          const reason = data.candidates[0].finishReason;
          let message = `Analysis could not be generated. Reason: ${reason}.`;
          if (reason === 'SAFETY' && data.candidates[0].safetyRatings) {
            message += ` Safety concerns: ${JSON.stringify(data.candidates[0].safetyRatings)}`;
          }
          // Send error back to the caller
          sendResponse({ error: message, details: data });
        } else if (data.promptFeedback && data.promptFeedback.blockReason) {
          // Handle cases where the prompt itself was blocked
          console.warn("Gemini prompt blocked. Reason:", data.promptFeedback.blockReason);
          // Send error back to the caller
          sendResponse({ error: `Prompt was blocked by Gemini. Reason: ${data.promptFeedback.blockReason}`, details: data });
        } else {
          console.error("Background: Could not extract analysis text from Gemini response structure.", data);
           // Send error back to the caller
          sendResponse({ error: "Could not parse analysis from Gemini response.", details: data });
        }
      } catch (error) {
        console.error("Background: Error during fetch or processing:", error);
        // Send error back to the caller
        sendResponse({ error: `Network or fetch error: ${error.message || error}` });
      }
    });

    // Return true to indicate you wish to send a response asynchronously
    return true;
  }
  // Allow other message types potentially in the future
  return false; 
});

console.log("Background script loaded and listener attached.");