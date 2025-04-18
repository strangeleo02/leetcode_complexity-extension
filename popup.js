document.addEventListener('DOMContentLoaded', () => {
    const apiKeyInput = document.getElementById('apiKey');
    const saveButton = document.getElementById('saveButton');
    const apiKeyStatusDiv = document.getElementById('apiKeyStatus');
    const analyzeButton = document.getElementById('analyzeButton');
    const statusDiv = document.getElementById('status');
    const resultArea = document.getElementById('resultArea');

    // Function to display status messages in the popup
    function showStatus(message, type = 'info') { // types: info, error, success
      statusDiv.textContent = message;
      statusDiv.className = type; // Apply styling class
      // Disable button only when actively processing (info state)
      analyzeButton.disabled = (type === 'info');
    }

    // Function to display API Key status
    function showApiKeyStatus(message, type = 'info') {
        apiKeyStatusDiv.textContent = message;
        apiKeyStatusDiv.className = type;
    }

    // Function to display results
    function showResult(content, isError = false) {
        resultArea.innerHTML = ''; // Clear previous results
        if (isError) {
            const errorStrong = document.createElement('strong');
            errorStrong.textContent = 'Error:';
            errorStrong.style.color = 'red';
            resultArea.appendChild(errorStrong);
            resultArea.appendChild(document.createTextNode(' ' + content));
        } else {
             const strong = document.createElement('strong');
             strong.textContent = 'Analysis Result:';
             const pre = document.createElement('pre');
             pre.textContent = content; // Safely set text content
             resultArea.appendChild(strong);
             resultArea.appendChild(pre);
        }
        resultArea.scrollTop = 0; // Scroll to top of results
    }

    // --- API Key Handling ---
    chrome.storage.sync.get(['geminiApiKey'], (result) => {
      if (result.geminiApiKey) {
        apiKeyInput.value = result.geminiApiKey;
        // Optional: showApiKeyStatus('API Key loaded.', 'success');
      } else {
          showApiKeyStatus('API Key not set. Analysis will fail.', 'error');
      }
    });

    saveButton.addEventListener('click', () => {
      const apiKey = apiKeyInput.value.trim();
      if (apiKey) {
        chrome.storage.sync.set({ geminiApiKey: apiKey }, () => {
          // Check for potential errors during storage set if needed
          if (chrome.runtime.lastError) {
             console.error("Error saving API Key:", chrome.runtime.lastError);
             showApiKeyStatus(`Error saving key: ${chrome.runtime.lastError.message}`, 'error');
          } else {
             console.log('API Key saved successfully.');
             showApiKeyStatus('API Key saved!', 'success');
             setTimeout(() => { apiKeyStatusDiv.textContent = ''; apiKeyStatusDiv.className = ''; }, 3000);
          }
        });
      } else {
        chrome.storage.sync.remove('geminiApiKey', () => {
          if (chrome.runtime.lastError) {
             console.error("Error clearing API Key:", chrome.runtime.lastError);
             showApiKeyStatus(`Error clearing key: ${chrome.runtime.lastError.message}`, 'error');
          } else {
             console.log('API Key cleared.');
             showApiKeyStatus('API Key cleared!', 'info');
             setTimeout(() => { apiKeyStatusDiv.textContent = ''; apiKeyStatusDiv.className = ''; }, 3000);
          }
        });
      }
    });

    // --- Analysis Button Handling ---
    analyzeButton.addEventListener('click', async () => {
      showStatus('Requesting code from page...', 'info');
      showResult(''); // Clear previous results

      let tabId; // Declare tabId here to use in error message if query fails

      try {
        // 1. Get the active tab
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tabs || tabs.length === 0 || !tabs[0]) {
             throw new Error("Could not get active tab information.");
        }
        const tab = tabs[0];
        tabId = tab.id; // Store tabId

        if (!tabId) {
            throw new Error("Active tab has no ID.");
        }

        // 2. Ensure the tab is a LeetCode page
        if (!tab.url || !(tab.url.startsWith("https://leetcode.com/problems/") || tab.url.startsWith("https://leetcode.com/submissions/"))) {
             throw new Error("Analysis only works on LeetCode problem or submission pages.");
        }

        // 3. Send message to content script to get the code
        // Use Promise to handle chrome.tabs.sendMessage callback/error cleaner
        const response = await new Promise((resolve, reject) => {
            chrome.tabs.sendMessage(tabId, { type: "getCode" }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(`Error messaging content script: ${chrome.runtime.lastError.message}`));
                } else if (!response) {
                    // Handle cases where the content script didn't send a response
                    // (might happen if the tab was closed or the script failed early)
                     reject(new Error("No response from content script. Ensure it's loaded correctly on the page."));
                } else {
                    resolve(response);
                }
            });
        });

        // Check response from content script
        if (response.error || !response.code) {
           throw new Error(response.error || "No code found on the page by content script.");
        }

        // 4. Code received, now send to background script for analysis
        const code = response.code;
        showStatus('Analyzing code with Gemini...', 'info');

        // Use Promise to handle chrome.runtime.sendMessage callback/error cleaner
        const analysisResponse = await new Promise((resolve, reject) => {
             chrome.runtime.sendMessage({ type: "analyzeCode", code: code }, (analysisResp) => {
                  if (chrome.runtime.lastError) {
                      reject(new Error(`Error messaging background script: ${chrome.runtime.lastError.message}`));
                  } else if (!analysisResp) {
                      reject(new Error("No response received from background script."));
                  }
                   else {
                      resolve(analysisResp);
                  }
             });
        });


        // Check response from background script
        if (analysisResponse.error) {
          console.error("Background script analysis error:", analysisResponse.error, analysisResponse.details);
          let errorDetails = analysisResponse.error;
          if (analysisResponse.details && analysisResponse.details.error) {
             errorDetails += `\nDetails: ${analysisResponse.details.error.message || JSON.stringify(analysisResponse.details.error)}`;
          } else if (typeof analysisResponse.details === 'string') {
              errorDetails += `\nDetails: ${analysisResponse.details}`;
          }
          throw new Error(errorDetails); // Throw error to be caught by outer catch
        } else if (analysisResponse.analysis) {
          console.log("Analysis successful");
          showStatus('Analysis complete.', 'success');
          showResult(analysisResponse.analysis); // Display raw analysis text in <pre>
          // Optionally clear success message after a delay
          setTimeout(() => { if (statusDiv.className === 'success') { statusDiv.textContent = ''; statusDiv.className = ''; } }, 4000);
        } else {
          // Should not happen if background script sends response correctly
          throw new Error("Received an unexpected or empty response from the background script.");
        }

      } catch (error) // Catching errors from await/Promise rejections
      {
        console.error("Popup analysis process error:", error);
        showStatus('Error during analysis.', 'error');
        showResult(`Failed: ${error.message}`, true);
        // Keep error message displayed
      } finally {
          analyzeButton.disabled = false; // Re-enable button after completion or error
      }
    }); // End of analyzeButton click listener

}); // End of DOMContentLoaded listener