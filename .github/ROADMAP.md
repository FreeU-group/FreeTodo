# FreeU Project Roadmap

## Project Vision

**FreeU Group** ("为您分忧" - Sharing Your Worries) aims to build personal context databases for data mining and processing, proactively providing proactive services to users.

By recording personal databases (**LifeLog**, personal life logging), we are committed to:
- Building complete personal context databases
- Conducting data mining and processing
- Providing proactive services to reduce users' cognitive burden
- Transforming from "chaos" to "order," providing users with psychological security and a warm, reliable, and trustworthy secretary partner

## FreeU Overall Project Roadmap

### 1. LifeTrace Phase (v0.2 Completed)

**Core Mission**: Build personal databases (LifeLog)

**Current Version**: v0.2 (one version ahead of Free Todo v0.1)

#### ✅ Completed Features

- **Computer Activity Flow Construction**: Continuously capturing user computer screen screenshots to generate various personal activity flows
  - Automatic screen content capture
  - Generate personal activity flow data
  - Lay the foundation for subsequent data mining

#### 🔮 Planned Features (Not Yet Started)

- **Audio Acquisition**
  - 24-hour recording functionality (user can choose to enable)
  - Extract personal data from audio
  - Enhance the dimensions of personal databases

- **Video Environment**
  - Acquire user's surrounding video environment information
  - Build more accurate personal databases
  - Provide richer contextual information

- **Smart Bracelet and Data Integration**
  - Integrate smart bracelets and other devices
  - Introduce more personal dimension information (privacy information, financial data, etc.)
  - Build multi-dimensional personal profiles

- **Large Language Model Deployment Evolution**
  - **Mid-term**: Hybrid use of cloud and local large language models for processing
  - **Long-term**: After local large language model technology matures, actively optimize local large language model services
    - All data runs locally
    - Effectively eliminate data privacy concerns

---

### 2. Free Todo Phase (v0.1 Currently In Progress)

**Core Mission**:
1. Fix user intentions and form the context of intentions to lay the foundation for future proactive services
2. Form personal context organization

**Core Philosophy**: Free Todo has only one core function—**Cognitive Offloading** (essentially/cognitively)

**Current Status**: Focusing on building the ultimate To-Do List, and on this basis, integrating the personal database built by LifeTrace to provide better services for individuals.

#### 🚧 Recent Plans (Focus on Input Layer - Currently In Progress)

**Goal**: Collect as much information as possible from users' daily lives and gather it as Todos

##### UI Dynamic Island

- ☐ Control voice input switch
- ☐ Control screenshot scheduled task switch
- ☐ Provide convenient window to access Todo list
- ☐ Provide convenient window to access Todo conversation interface

##### Agent Development

- 🚧 Develop tool scheduling capability for AI chat interface (expected to be delivered within two weeks)
  - Upgrade from basic conversation to intelligent Agent supporting multiple tool calls
  - Support completing tasks by calling different tools through Agent
  - Achieve tool scheduling capability similar to general-purpose Agents

#### Input Layer: Reduce Input Burden, Thought-Stream-Like Capture

**Design Philosophy**:
- Entry point needs to be "close" - input should be simple and clean
- Whatever the user throws at it, that's what it is (text, screenshots, voice)
- Classification should be delayed, or let AI decide
- Capture should be imperceptible

**Feature Planning**:

- **Voice Input**
  - Dynamic Island voice input
  - Hotkey to activate voice input

- **Multimodal Input**
  - Text (user input, AI generation)
  - Screenshots
  - Voice

- **Social Software Integration**
  - WeChat todo capture
  - Feishu todo capture
  - Todo capture from other social software

- **Intelligent Extraction**
  - Todo extraction from chat windows
  - Todo extraction from messages
  - Todo creation during chat (Agent calls creation tool)

#### Intermediate Processing Layer: From "Chaos" to "Order"

**Design Philosophy**: Transform diverse input sources (chaotic inputs) into ordered information

**Feature Planning**:

- **Intent Completion / Task Detail Completion**
  - AI assists users in completion
  - For users: input is simpler and faster
  - For AI: provides more context

- **Automatic Decomposition**
  - Breaking "big rocks" into "small stones" - AI task decomposition
  - Task graph-based organization (currently tree structure of todolist)
  - Casual recording, AI automatically organizes
  - Check data → automatic resource system integration
  - Meaning alignment

- **Automatic Classification and Organization**
  - Classification should be delayed, or let AI decide
  - Intelligent tag generation
  - Task relationship analysis

- **Task Priority Planning**
  - AI plans task priorities
  - Identify main tasks to do today
  - Intelligent task sorting recommendations

- **Environmental Data Collection**
  - Collect environmental data (integrated with LifeTrace)
  - Build task context

- **Context Construction**
  - Form personal context organization
  - Lay the foundation for proactive services

#### Output Layer: Psychological Security + Warm, Reliable, and Trustworthy Secretary Partner

**Final Effect**: Psychological security + warm, reliable, and trustworthy secretary partner

**Feature Planning**:

- **AI Secretary Personification**
  - Warm, reliable, and trustworthy secretary partner
  - Humanized interaction experience

- **Schedule Reminders**
  - Intelligent reminder system
  - Multi-dimensional reminder strategies

- **Task Focus Mode**
  - Only display part of tasks
  - Help users focus on current important items

- **Completed Task Reinforcement (Merit Ledger)**
  - Reinforce completed todos
  - Visualize achievements and progress

- **Overdue Task Re-planning**
  - Transform overdue tasks into re-planning
  - Avoid user psychological burden
  - Provide opportunities to start fresh

#### To-Do List Workbench (Long-term Vision)

**Design Philosophy**:
- Treat To-Do List as a fixed context center
- Directly call Agents within Free Todo to generate content (such as PPTs or articles)
- Similar to Cursor's Plan Mode: asks users questions it feels are unclear, allowing users to supplement context for better results
- Generate plans and submit them to users for review

**Core Value**:
- Another meaning of "Free Todo": "Just Do It, Let Go and Do It"
- Get things done directly within the To-Do List
- Provide psychological security, allowing users to focus on important decisions

**Feature Planning**:

- ☐ Fixed context center based on To-Do List
- ☐ Directly call Agents within Free Todo to generate content
- ☐ Interactive experience similar to Cursor Plan Mode
- ☐ Generate plans and submit them to users for review
- ☐ Support generating various types of content (PPT, articles, code, etc.)

#### 🔬 Features in Development (Panels in the Panel Switch Bar)

**Description**: Free Todo's panel switch bar contains some panels that are currently under development. These panels showcase our future feature directions for community reference and understanding.

**Community Participation**: We warmly welcome community members to participate!

- **Panel Contributions**:
  - Contribute your own panel designs
  - Propose improvement suggestions and ideas for existing panels

- **Agent Algorithm Contributions**:
  - Contribute new Agent algorithms
  - We actively merge these new algorithms!

---

### 3. Proactive Service Phase (Future Planning)

**Core Mission**: TODO proactive services, intent detection

Based on LifeTrace data and Free Todo intentions, proactively provide services to users:

- Intent detection and proactive services
- Intelligent recommendations based on personal databases
- Context-aware service triggers

---

### 4. Agent Ecosystem Phase (Long-term Vision)

**Core Mission**: Build a complete agent ecosystem

**Feature Modules**:

- **Digital Marketing Agent**: computer use iflow digital marketing agent
- **Digital Deliverables RM**: Digital deliverables resource management

**Interaction Capabilities**:

- **Cross-device**: PC + Mobile + AI Hardware
- **Cross-modal**: Support multiple interaction modalities (text, voice, images, etc.)
- **Cross-application**: Integrate various applications and services

---

## Technical Architecture Evolution

### Data Flow

```
LifeTrace (Personal Database)
    ↓
Free Todo (Intent Fixation + Context Organization)
    ↓
Proactive Services (Based on Data + Intent)
    ↓
Agent Ecosystem (Multi-dimensional Services)
```

### Core Value Realization

1. **Cognitive Offloading**: Reduce user input and processing burden through automation
2. **From Chaos to Order**: Transform disordered inputs into ordered tasks and actions
3. **Psychological Security**: Make users feel secure through AI assistance and intelligent planning
4. **Proactive Services**: Proactively provide valuable suggestions and services based on personal data

---

## Community Participation

We welcome community members to participate in the project in various ways:

- 🎨 **Panel Development**: Contribute panel designs or propose improvements
- 🤖 **Agent Algorithms**: Contribute new Agent algorithms, we actively merge them
- 🐛 **Issue Reporting**: Report issues or propose feature suggestions
- 📝 **Documentation Improvements**: Improve documentation and tutorials
- 💻 **Code Contributions**: Implement new features or fix issues

See our [Contributing Guidelines](../.github/CONTRIBUTING.md) for more details.

---

## Version History

- **LifeTrace v0.2** (Completed): Computer activity flow construction
- **Free Todo v0.1** (In Progress): To-Do List core feature development

---

*Last updated: 2026.1.11*
