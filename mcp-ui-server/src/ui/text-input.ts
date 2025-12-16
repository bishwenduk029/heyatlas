interface TextInputConfig {
  prompt: string;
  placeholder?: string;
  inputType?: "text" | "email" | "tel" | "url" | "password";
  multiline?: boolean;
  maxLength?: number;
}

interface TextInputForm {
  id: string;
  type: "text-input";
  config: TextInputConfig;
  html: string;
}

export const textInputUI = {
  createForm(config: TextInputConfig): TextInputForm {
    return {
      id: `form-${Date.now()}`,
      type: "text-input",
      config,
      html: this.renderHTML(config),
    };
  },

  renderHTML(config?: TextInputConfig): string {
    const defaultConfig: TextInputConfig = {
      prompt: config?.prompt || "Enter your input",
      placeholder: config?.placeholder || "",
      inputType: config?.inputType || "text",
      multiline: config?.multiline || false,
      maxLength: config?.maxLength || 500,
    };

    const inputElement = defaultConfig.multiline
      ? `<textarea
          id="userInput"
          name="userInput"
          placeholder="${defaultConfig.placeholder}"
          maxlength="${defaultConfig.maxLength}"
          rows="5"
          required
        ></textarea>`
      : `<input
          id="userInput"
          type="${defaultConfig.inputType}"
          name="userInput"
          placeholder="${defaultConfig.placeholder}"
          maxlength="${defaultConfig.maxLength}"
          required
        />`;

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MCP UI - Text Input</title>
  <style>
    :root {
      /* Theme colors matching @on-cloud/web/styles/theme.css */
      --background: oklch(1 0 0);
      --foreground: oklch(0.145 0 0);
      --card: oklch(1 0 0);
      --card-foreground: oklch(0.145 0 0);
      --primary: oklch(0.205 0 0);
      --primary-foreground: oklch(0.985 0 0);
      --secondary: oklch(0.97 0 0);
      --secondary-foreground: oklch(0.205 0 0);
      --muted: oklch(0.97 0 0);
      --muted-foreground: oklch(0.556 0 0);
      --border: oklch(0.922 0 0);
      --input: oklch(0.922 0 0);
      --ring: oklch(0.87 0 0);
      --radius: 0.5rem;
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --background: oklch(0.145 0 0);
        --foreground: oklch(0.985 0 0);
        --card: oklch(0.145 0 0);
        --card-foreground: oklch(0.985 0 0);
        --primary: oklch(0.985 0 0);
        --primary-foreground: oklch(0.205 0 0);
        --secondary: oklch(0.269 0 0);
        --secondary-foreground: oklch(0.985 0 0);
        --muted: oklch(0.269 0 0);
        --muted-foreground: oklch(0.708 0 0);
        --border: oklch(0.269 0 0);
        --input: oklch(0.269 0 0);
        --ring: oklch(0.439 0 0);
      }
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background-color: hsl(from var(--background) h s l / 1);
      color: hsl(from var(--foreground) h s l / 1);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }

    .container {
      background-color: hsl(from var(--card) h s l / 1);
      border: 1px solid hsl(from var(--border) h s l / 1);
      border-radius: var(--radius);
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
      padding: 32px;
      max-width: 500px;
      width: 100%;
    }

    .form-header {
      margin-bottom: 24px;
    }

    .form-header h1 {
      font-size: 24px;
      color: hsl(from var(--card-foreground) h s l / 1);
      margin-bottom: 8px;
      font-weight: 600;
    }

    .form-header p {
      color: hsl(from var(--muted-foreground) h s l / 1);
      font-size: 14px;
    }

    .form-group {
      margin-bottom: 20px;
    }

    label {
      display: block;
      margin-bottom: 8px;
      color: hsl(from var(--foreground) h s l / 1);
      font-weight: 500;
      font-size: 14px;
    }

    input[type="text"],
    input[type="email"],
    input[type="tel"],
    input[type="url"],
    input[type="password"],
    textarea {
      width: 100%;
      padding: 12px;
      border: 2px solid hsl(from var(--input) h s l / 1);
      background-color: hsl(from var(--background) h s l / 1);
      color: hsl(from var(--foreground) h s l / 1);
      border-radius: calc(var(--radius) - 2px);
      font-size: 16px;
      font-family: inherit;
      transition: border-color 0.2s, box-shadow 0.2s;
    }

    input[type="text"]:focus,
    input[type="email"]:focus,
    input[type="tel"]:focus,
    input[type="url"]:focus,
    input[type="password"]:focus,
    textarea:focus {
      outline: none;
      border-color: hsl(from var(--primary) h s l / 1);
      box-shadow: 0 0 0 3px hsl(from var(--ring) h s l / 0.1);
    }

    textarea {
      resize: vertical;
      font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
    }

    .char-counter {
      font-size: 12px;
      color: hsl(from var(--muted-foreground) h s l / 1);
      margin-top: 6px;
      text-align: right;
    }

    .form-actions {
      display: flex;
      gap: 12px;
      margin-top: 24px;
    }

    button {
      flex: 1;
      padding: 12px 16px;
      border: none;
      border-radius: calc(var(--radius) - 2px);
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-submit {
      background-color: hsl(from var(--primary) h s l / 1);
      color: hsl(from var(--primary-foreground) h s l / 1);
      border: none;
    }

    .btn-submit:hover {
      transform: translateY(-2px);
      opacity: 0.9;
      box-shadow: 0 10px 20px hsl(from var(--primary) h s l / 0.2);
    }

    .btn-submit:active {
      transform: translateY(0);
    }

    .btn-cancel {
      background-color: hsl(from var(--secondary) h s l / 1);
      color: hsl(from var(--secondary-foreground) h s l / 1);
      border: 2px solid hsl(from var(--border) h s l / 1);
    }

    .btn-cancel:hover {
      background-color: hsl(from var(--muted) h s l / 1);
    }

    .loading {
      display: none;
      text-align: center;
      color: hsl(from var(--primary) h s l / 1);
      font-size: 14px;
      margin-top: 16px;
    }

    .spinner {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid hsl(from var(--border) h s l / 1);
      border-top-color: hsl(from var(--primary) h s l / 1);
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
      margin-right: 8px;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .success {
      display: none;
      text-align: center;
      padding: 20px;
      background-color: hsl(from var(--secondary) h s l / 0.1);
      border: 2px solid hsl(from var(--primary) h s l / 0.5);
      border-radius: calc(var(--radius) - 2px);
      color: hsl(from var(--primary) h s l / 1);
    }

    .success.active {
      display: block;
    }

    .success svg {
      width: 48px;
      height: 48px;
      margin-bottom: 12px;
      fill: hsl(from var(--primary) h s l / 1);
    }
  </style>
</head>
<body>
  <div class="container">
    <form id="textInputForm">
      <div class="form-header">
        <h1>Input Required</h1>
        <p>Please provide the requested information below</p>
      </div>

      <div class="form-group">
        <label for="userInput">${defaultConfig.prompt}</label>
        ${inputElement}
        <div class="char-counter">
          <span id="charCount">0</span>/<span id="maxLength">${defaultConfig.maxLength}</span>
        </div>
      </div>

      <div class="form-actions">
        <button type="submit" class="btn-submit">Submit</button>
        <button type="button" class="btn-cancel" onclick="handleCancel()">Cancel</button>
      </div>

      <div class="loading" id="loading">
        <span class="spinner"></span>Submitting...
      </div>

      <div class="success" id="success">
        <svg fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
        </svg>
        <div>Input submitted successfully!</div>
      </div>
    </form>
  </div>

  <script>
    const form = document.getElementById('textInputForm');
    const userInput = document.getElementById('userInput');
    const charCount = document.getElementById('charCount');
    const maxLength = document.getElementById('maxLength');
    const loading = document.getElementById('loading');
    const success = document.getElementById('success');

    userInput?.addEventListener('input', () => {
      charCount.textContent = userInput.value.length;
    });

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      loading.style.display = 'block';

      try {
        const inputValue = userInput.value.trim();

        if (!inputValue) {
          alert('Please enter a value');
          loading.style.display = 'none';
          return;
        }

        // Show success UI
        loading.style.display = 'none';
        success.classList.add('active');
        form.style.display = 'none';

        // Send data back to parent window (voice agent web page)
        // This triggers MCPUIHandler in the voice agent frontend
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({
            type: 'mcp-ui-submit',
            data: {
              userInput: inputValue,
              timestamp: new Date().toISOString()
            }
          }, '*');

          console.log('[MCP UI] Submitted to parent:', inputValue);
        }
      } catch (error) {
        loading.style.display = 'none';
        console.error('[MCP UI] Submission error:', error);
        alert('Error submitting form: ' + error.message);
      }
    });

    function handleCancel() {
      // Send cancellation message to parent window
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          type: 'mcp-ui-cancel',
          timestamp: new Date().toISOString()
        }, '*');

        console.log('[MCP UI] User cancelled input');
      }
      form?.reset();
    }
  </script>
</body>
</html>
    `;
  },
};
