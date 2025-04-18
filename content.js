console.log("LeetCode Complexity Analyzer: Content script loaded and ready.");

// --- Robust Element Finding (prioritizing user's selector) ---

function findCodeElement() {
  console.log("Attempting to find code element...");
  // Specific Monaco Editor Selector (likely for problem pages) - PRIORITIZED
  const specificEditorSelector = "#editor > div.flex.flex-1.flex-col.overflow-hidden.pb-2 > div.flex-1.overflow-hidden > div > div > div.overflow-guard > div.monaco-scrollable-element.editor-scrollable.vs-dark > div.lines-content.monaco-editor-background > div.view-lines.monaco-mouse-cursor-text";
  
  // General selectors array
  const selectors = [
    specificEditorSelector, // Try the most specific one first
    
    // Other Monaco editor selectors
    'div[class*="monaco-editor"] .view-lines',
    'div[data-monaco-editor-id] .view-lines', // More specific for content
    'div[class*="editor-instance"] .view-lines', // Another common pattern

    // Ace editor
    '.ace_content',
    '.ace_text-layer',
    
    // Submission details view selectors
    'div[class*="code-area"] pre',
    'div[class*="code-panel"] pre',
    'div[class*="bg-layer-1"] pre[id*="code-"]',
    'div[data-key="code-definition"] pre code', // Newer submission UI?
    '#submission-code pre', // Older submission UI?
    '.language-python pre code', // Often used in rendered views
    '.language-javascript pre code',
    '.language-java pre code',
    '.language-cpp pre code',
    'div.overflow-y-auto.break-all pre', // General container for code blocks

    // More generic selectors as fallbacks
    'div.font-mono.text-sm.overflow-x-auto.whitespace-pre pre',
    'pre > code', // Code inside pre often holds the actual text
    'pre' // Last resort: any pre tag
  ];

  for (const selector of selectors) {
      try {
          const elements = document.querySelectorAll(selector);
          // console.log(`Trying selector: "${selector}", Found: ${elements.length}`); // Debugging
          if (elements.length > 0) {
            // Find the element with the most substantial content
            let bestElement = null;
            let maxLength = 50; // Require at least 50 chars

            for (const element of elements) {
              // Check if element is visible (basic check)
              if (element.offsetParent === null && element.offsetHeight === 0 && element.offsetWidth === 0) {
                   // console.log("Skipping hidden element for selector:", selector, element);
                   continue; // Skip elements likely hidden
              }
              
              const content = extractCodeFromElement(element); // Use helper to get text
              if (content && content.length > maxLength) {
                  maxLength = content.length;
                  bestElement = element;
              }
            }
            
            if (bestElement) {
              console.log("Found best code element with selector:", selector, bestElement);
              return bestElement; // Return the one with most content found using this selector
            }
          }
      } catch (e) {
          console.warn(`Error processing selector "${selector}": ${e.message}`); // Handle invalid selectors
      }
  }

  console.error("Content Script: Could not reliably find the code element.");
  return null;
}

// Helper function to get text content, handling common structures like Monaco/Ace lines
function extractCodeFromElement(element) {
  if (!element) return null;

  // 1. Monaco editor specific structure (handles the user's specific selector)
   if (element.classList.contains('view-lines') || element.closest('[data-monaco-editor-id]')) {
       const lines = Array.from(element.querySelectorAll('.view-line'))
                          .map(line => {
                               // Attempt to preserve indentation by checking leading whitespace
                               const lineContent = line.textContent || '';
                               return lineContent.replace(/\u00a0/g, ' '); // Replace non-breaking spaces common in Monaco
                          });
       return lines.join('\n').trim(); // Trim only start/end of the whole block
  }
  
  // 2. Ace editor structure
  if (element.classList.contains('ace_content') || element.classList.contains('ace_text-layer')) {
    const lines = Array.from(element.querySelectorAll('.ace_line'))
                       .map(line => line.textContent || '');
    return lines.join('\n').trim();
  }
  
  // 3. CodeMirror structure (less common on modern LeetCode?)
  if (element.closest('.CodeMirror')) {
     const lines = Array.from(element.querySelectorAll('.CodeMirror-line'))
                        .map(line => line.textContent || '');
     return lines.join('\n').trim();
  }

  // 4. Standard pre/code elements (handles submission pages)
  if (element.tagName === 'PRE') {
    const codeChild = element.querySelector('code');
    if (codeChild) {
      return codeChild.textContent?.trim() || ''; // Prefer content of <code> if present
    }
    return element.textContent?.trim() || '';
  }
  
  // 5. Fallback for other divs or elements
  return element.textContent?.trim() || '';
}


// --- Message Listener ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "getCode") {
    console.log("Content Script: Received request for code from popup.");
    const codeElement = findCodeElement();

    if (codeElement) {
       const code = extractCodeFromElement(codeElement); // Use the helper here too
      if (code) {
        console.log("Content Script: Found code, sending response.");
        sendResponse({ code: code });
      } else {
         console.error("Content Script: Found code element but could not extract text content.");
         sendResponse({ error: "Found code container, but failed to extract text content." });
      }
    } else {
      console.error("Content Script: Code element not found on the page.");
      sendResponse({ error: "Could not find the code element on the page. Make sure the code editor or submission code is visible." });
    }
    // Return true to indicate you wish to send a response asynchronously
    return true;
  }
});

// --- Removed ---
// - findInsertionPoint function
// - addAnalysisButton function
// - Initialization logic (MutationObserver/polling)
// - escapeHtml function (now handled in popup if needed, but textContent is safer)