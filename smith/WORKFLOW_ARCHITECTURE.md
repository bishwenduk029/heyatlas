# Multi-Agent Workflow Architecture

This document describes the multi-agent workflow system built with VoltAgent for solving complex computational problems through specialized agent coordination.

## Architecture Overview

The system uses a **Workflow Orchestrator** (PlanAgent) that coordinates multiple specialized subagents. Each subagent is an expert in a specific domain and has access to relevant MCP (Model Context Protocol) tools.

```
┌─────────────────────────────────────────────────┐
│         Workflow Orchestrator (Main)            │
│  - Analyzes user requests                       │
│  - Creates execution plans                      │
│  - Delegates to specialized agents              │
│  - Synthesizes final results                    │
└─────────────────────────────────────────────────┘
                      │
      ┌───────────────┼───────────────┬───────────────┬──────────────┐
      │               │               │               │              │
      ▼               ▼               ▼               ▼              ▼
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│Markdown  │   │ Browser  │   │Presenta- │   │Document  │   │ Format   │
│Converter │   │Automation│   │tion      │   │Writer    │   │Converter │
│          │   │          │   │Creator   │   │          │   │          │
│MarkItDown│   │  Vibium  │   │PowerPoint│   │Word MCP  │   │ Pandoc   │
│   MCP    │   │   MCP    │   │   MCP    │   │          │   │   MCP    │
└──────────┘   └──────────┘   └──────────┘   └──────────┘   └──────────┘
```

## Specialized Subagents

### 1. Markdown Converter (`markdown-converter`)
**Purpose:** Convert various document formats to Markdown

**MCP Tools:** Microsoft MarkItDown
- PDF → Markdown (with structure preservation)
- Word (.docx) → Markdown
- Excel → Markdown tables
- Images → Text (OCR)
- Audio → Text transcription

**Use Cases:**
- Extracting content from PDFs for further processing
- Converting legacy documents to modern format
- Preparing content for presentation or document creation

### 2. Browser Automation (`browser-automation`)
**Purpose:** Execute complex web automation workflows including form filling, navigation, data extraction, and research

**MCP Tools:** Vibium (AI-native browser automation)
- Website navigation and programmatic interaction
- Form filling and submission (registrations, applications, surveys)
- Button clicks and element interaction
- Text input and data entry
- Data extraction and web scraping
- Screenshot capture and page state documentation
- Multi-step workflow execution (login → navigate → extract → submit)
- Comprehensive topic research
- Multi-source information verification

**Use Cases:**
- Automating form submissions and data entry
- Gathering information for reports or presentations
- Executing multi-step web workflows (account creation, booking processes)
- Data extraction from websites for analysis
- Competitive research and market analysis
- Automated testing and verification workflows

### 3. Presentation Creator (`presentation-creator`)
**Purpose:** Create and edit PowerPoint presentations

**MCP Tools:** Office PowerPoint MCP Server
- Create new presentations from scratch
- Add slides with various layouts
- Format text, images, and visual elements
- Structure content logically
- Apply consistent styling

**Use Cases:**
- Converting research or documents into presentations
- Creating business presentations from data
- Building educational slide decks

### 4. Document Writer (`document-writer`)
**Purpose:** Create and edit Word documents

**MCP Tools:** Office Word MCP Server
- Create formatted documents
- Proper heading hierarchy
- Tables, lists, and images
- Professional styling
- Table of contents generation

**Use Cases:**
- Creating reports from research
- Converting presentations to documents
- Writing formal documentation

### 5. Format Converter (`format-converter`)
**Purpose:** Convert between various document formats using Pandoc

**MCP Tools:** Pandoc MCP
- Markup format conversion (Markdown, HTML, LaTeX)
- Document format transformation (DOCX, ODT, RTF)
- Presentation format conversion
- Ebook formats (EPUB, MOBI)

**Use Cases:**
- Converting between formats not covered by other agents
- Batch format conversions
- Specialized format transformations

## Workflow Patterns

### Pattern 1: PDF to Presentation
**Scenario:** User has PDFs and wants to create a PowerPoint presentation

**Workflow:**
```
1. User Request: "Convert this PDF to a presentation"
2. Orchestrator creates plan
3. Delegate to markdown-converter: PDF → Markdown
4. Delegate to presentation-creator: Markdown → PPT
5. Synthesize and deliver result
```

**Agent Sequence:**
```
PDF file → markdown-converter → Markdown text → presentation-creator → PowerPoint file
```

### Pattern 2: Research to Document
**Scenario:** User wants a Word document about a topic based on web research

**Workflow:**
```
1. User Request: "Create a report on AI agents based on web research"
2. Orchestrator creates plan
3. Delegate to browser-automation: Research "AI agents"
4. Delegate to document-writer: Create Word doc from research
5. Synthesize and deliver result
```

**Agent Sequence:**
```
Topic → browser-automation → Research data → document-writer → Word document
```

### Pattern 3: Multi-Format Conversion Chain
**Scenario:** User needs to convert Word doc to Markdown to HTML

**Workflow:**
```
1. User Request: "Convert this Word doc to HTML"
2. Orchestrator creates plan
3. Delegate to markdown-converter: DOCX → Markdown
4. Delegate to format-converter: Markdown → HTML
5. Synthesize and deliver result
```

**Agent Sequence:**
```
DOCX → markdown-converter → Markdown → format-converter → HTML
```

### Pattern 4: Web Data to Presentation
**Scenario:** Extract data from website and create presentation

**Workflow:**
```
1. User Request: "Create a presentation about products from website X"
2. Orchestrator creates plan
3. Delegate to browser-automation: Extract product data
4. Delegate to presentation-creator: Create slides from data
5. Synthesize and deliver result
```

**Agent Sequence:**
```
Website URL → browser-automation → Extracted data → presentation-creator → PowerPoint
```

### Pattern 6: Web Form Automation
**Scenario:** Fill out and submit a web form with provided data

**Workflow:**
```
1. User Request: "Fill out the contact form at example.com with my information"
2. Orchestrator creates plan
3. Delegate to browser-automation: Navigate, fill form, submit
4. Capture confirmation and report success
```

**Agent Sequence:**
```
Form URL + Data → browser-automation → Form filled & submitted → Confirmation
```

### Pattern 5: Document Translation Pipeline
**Scenario:** Convert PDF to Word document via Markdown

**Workflow:**
```
1. User Request: "Convert this PDF to an editable Word document"
2. Orchestrator creates plan
3. Delegate to markdown-converter: PDF → Markdown
4. Delegate to format-converter: Markdown → DOCX (or)
   Delegate to document-writer: Create structured Word doc
5. Synthesize and deliver result
```

**Agent Sequence:**
```
PDF → markdown-converter → Markdown → document-writer → Word document
```

## How It Works

### 1. Request Analysis
The Workflow Orchestrator receives the user request and analyzes:
- What is the goal? (create presentation, research topic, convert format)
- What inputs are provided? (files, URLs, text)
- What outputs are expected? (document type, format)
- What workflow pattern fits best?

### 2. Plan Creation
Using the built-in `write_todos` tool, the orchestrator creates a detailed plan:
```
[ ] Step 1: Convert PDF to Markdown using markdown-converter
[ ] Step 2: Create PowerPoint from Markdown using presentation-creator
[ ] Step 3: Verify output quality and formatting
[ ] Step 4: Deliver final presentation to user
```

### 3. Task Delegation
The orchestrator uses the `task` tool to delegate work to subagents:
```typescript
// Example: Delegate PDF conversion
task({
  description: "Convert attached PDF to clean Markdown format",
  targetAgents: ["markdown-converter"],
  context: { file: "document.pdf" }
})
```

### 4. Subagent Execution
Each subagent:
- Receives the delegated task
- Uses its specialized MCP tools
- Processes the task independently
- Returns results to orchestrator

### 5. Result Synthesis
The orchestrator:
- Collects results from all subagents
- Verifies quality and completeness
- Synthesizes into final output
- Provides clear summary to user

## Key Features

### Intelligent Workflow Planning
- Automatically identifies optimal agent sequence
- Adapts to different user request patterns
- Updates plan as execution progresses

### Context Preservation
- Maintains data flow between agents
- Shares relevant context with subagents
- Preserves file references and metadata

### Error Handling
- Graceful failure recovery
- Suggests alternative workflows
- Provides clear error messages

### Progress Updates
- Reports workflow progress via `send_task_update` tool
- Shows which agent is currently executing
- Provides status at each major step

### Modular Design
- Easy to add new specialized agents
- Each agent focuses on one domain
- Clean separation of concerns

## Example Usage

### Example 1: Simple PDF to PPT
**User:** "Convert my research.pdf to a presentation"

**System Response:**
```
Creating workflow plan:
1. Extract content from PDF to Markdown
2. Structure content into presentation slides
3. Generate PowerPoint file

Delegating to markdown-converter...
✓ PDF converted to Markdown (5 pages, 2000 words)

Delegating to presentation-creator...
✓ Created 12-slide presentation

Final result: research_presentation.pptx
```

### Example 2: Research Report
**User:** "Create a Word document about quantum computing based on recent research"

**System Response:**
```
Creating workflow plan:
1. Research quantum computing using web sources
2. Compile and structure findings
3. Create formatted Word document

Delegating to browser-automation...
✓ Researched 8 sources (3000 words of content)

Delegating to document-writer...
✓ Created structured report with 5 sections

Final result: quantum_computing_report.docx
```

### Example 3: Complex Workflow
**User:** "I need a presentation about AI trends. Research online, and make it professional"

**System Response:**
```
Creating workflow plan:
1. Research current AI trends from web
2. Identify key themes and data points
3. Structure content for presentation
4. Create professional PowerPoint slides

Delegating to browser-automation...
✓ Researched AI trends (10 sources, identified 5 major themes)

Delegating to presentation-creator...
✓ Created 15-slide presentation with:
  - Title slide
  - 5 trend analysis slides
  - Supporting data slides
  - Conclusion and recommendations

Final result: ai_trends_2026.pptx
```

## Benefits

1. **Modularity:** Each agent specializes in one task
2. **Scalability:** Easy to add new agents for new capabilities
3. **Maintainability:** Clear separation makes debugging easier
4. **Flexibility:** Can handle various workflow combinations
5. **Intelligence:** Orchestrator chooses optimal workflow path
6. **Reliability:** Focused agents are more reliable than general-purpose tools

## Technical Implementation

See `src/index.ts` for the complete implementation:
- MCP server configuration in `MCPConfiguration`
- Subagent definitions with specialized prompts
- Workflow orchestrator setup with planning configuration
- Tool filtering for each subagent type
