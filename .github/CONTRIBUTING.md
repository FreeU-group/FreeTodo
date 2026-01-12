# Contributing Guide

**Language**: [English](CONTRIBUTING.md) | [中文](CONTRIBUTING_CN.md)

> ⚠️ **Important**: Before starting to contribute, please read and configure the [**Pre-commit Guide**](PRE_COMMIT_GUIDE.md). Pre-commit automatically runs code checks and formatting on every `git commit` to ensure code quality and style consistency. This is an essential tool for maintaining code quality in the project, please complete the installation and configuration.

## 🎉 Welcome Contributors

Thank you for your interest in the FreeTodo project! We welcome and appreciate any form of contribution. Whether you're fixing a typo, reporting a bug, or proposing a major new feature, we're grateful.

## 📋 Table of Contents

- [Getting Started](#-getting-started)
- [Development Setup](#️-development-setup)
- [Git Flow Workflow](#-git-flow-workflow)
- [Contribution Workflow](#-contribution-workflow)
- [Coding Standards](#-coding-standards)
- [Commit Message Guidelines](#-commit-message-guidelines)
- [Pull Request Guidelines](#-pull-request-guidelines)
- [Reporting Issues](#-reporting-issues)
- [Community](#-community)

### Finding Tasks

1. **Browse Issues**: Check the [Issues page](https://github.com/FreeU-group/FreeTodo/issues)
2. **Look for Labels**:
   - `good first issue` - Simple tasks for beginners
   - `help wanted` - Tasks that need help
   - `bug` - Bug fixes
   - `enhancement` - New features
   - `documentation` - Documentation improvements
3. **Propose Ideas**: Create an Issue for discussion if you have new ideas

### Types of Contributions

#### 🐛 Bug Reports

- Use the Bug Report template
- Provide detailed reproduction steps
- Include environment information
- Provide screenshots or logs if possible

#### 💡 Feature Requests

- Use the Feature Request template
- Clearly describe the purpose and value
- Provide usage scenarios
- Consider technical feasibility

#### 📝 Documentation

- Fix errors in documentation
- Add missing documentation
- Improve code comments
- Translate documentation

#### 🧪 Testing

- Increase test coverage
- Fix failing tests
- Add edge case tests

#### 🔧 Code Contributions

- Fix bugs
- Implement new features
- Performance optimization
- Code refactoring

## 🛠️ Development Setup

### Prerequisites

#### Backend Development

- Python 3.12
- [uv](https://github.com/astral-sh/uv) package manager
- Git

#### Frontend Development

- Node.js 20+
- pnpm package manager
- Git

### Clone Repository

```bash
# Clone your forked repository
git clone https://github.com/YOUR_USERNAME/FreeTodo.git
cd FreeTodo

# Add upstream repository
git remote add upstream https://github.com/FreeU-group/FreeTodo.git
```

### Backend Setup

```bash
# Install uv (if not already installed)
# macOS/Linux
curl -LsSf https://astral.sh/uv/install.sh | sh

# Windows
powershell -c "irm https://astral.sh/uv/install.ps1 | iex"

# Install dependencies
uv sync

# Activate virtual environment
# macOS/Linux
source .venv/bin/activate

# Windows
.venv\Scripts\activate

# Start backend service
python -m lifetrace.server
```

### Frontend Setup

```bash
# Navigate to frontend directory
cd free-todo-frontend

# Install pnpm (if not already installed)
npm install -g pnpm

# Install dependencies
pnpm install

# Start development server
pnpm dev
```

### Verify Setup

1. Backend should start searching for an available port from `8001` (default runs on `http://localhost:8001`)
2. Frontend should start searching for an available port from `3001` (default runs on `http://localhost:3001`)
3. Frontend automatically detects the running backend port by checking the `/health` endpoint
4. The actual ports used will be displayed in the console
5. Visit the API documentation address shown in the console (usually `http://localhost:8001/docs`) to view the API docs
6. Visit the frontend address shown in the console (usually `http://localhost:3001`) to view the frontend interface

> **Note**: If a port is occupied, both frontend and backend will automatically search for the next available port. The console will display the actual port used.

## 🌿 Git Flow Workflow

FreeTodo project adopts a standardized Git Flow branch management strategy to ensure code quality and standardized development processes.

### Branch Structure

We maintain the following branches:

- **`main`** - Production environment branch, contains the most stable code, directly deployable
- **`dev`** - Development environment branch for daily development and feature integration
- **`test`** - Testing environment branch for complete integration testing
- **`feat/*`** - Feature development branches, created from `dev`
- **`fix/*`** - Bug fix branches, created from `dev`, `test`, or `main`
- **`hotfix/*`** - Emergency fix branches, created from `main`

### Detailed Workflow

For complete documentation on Git Flow, including branch strategy, workflow, naming conventions, common scenarios, and best practices, please refer to:

📖 **[Git Flow Workflow Documentation](GIT_FLOW.md)**

This documentation includes:

- 🌳 Complete branch strategy explanation
- 🔄 Detailed workflows for various scenarios
- 📝 Branch naming conventions
- 🎯 Common development scenario examples
- 💡 Best practices and tips
- ❓ FAQ
- 🚦 Workflow diagrams
- 📚 Git command cheat sheet

### Quick Start

If you're already familiar with Git Flow, here's a quick reference:

```bash
# 1. Create feature branch from dev
git checkout dev
git pull origin dev
git checkout -b feat/your-feature-name

# 2. Develop and commit
git add .
git commit -m "feat: your feature description"

# 3. Push and create PR
git push origin feat/your-feature-name
# Create PR to dev branch on GitHub
```

## 📝 Contribution Workflow

### 1. Create Branch

Always create a new branch from the latest `main`:

```bash
# Update local main branch
git checkout main
git pull upstream main

# Create new branch
git checkout -b feat/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

Branch naming conventions:

- `feat/xxx` - New features
- `fix/xxx` - Bug fixes
- `docs/xxx` - Documentation updates
- `refactor/xxx` - Code refactoring
- `test/xxx` - Test related
- `chore/xxx` - Build tools or auxiliary changes

### 2. Make Changes

- Follow project coding standards
- Write clear code comments
- Ensure code runs correctly
- Add or update relevant tests
- Update relevant documentation

### 3. Commit Changes

```bash
# Add changed files
git add .

# Commit changes (follow commit message guidelines)
git commit -m "feat: add new feature"

# Push to your fork
git push origin feat/your-feature-name
```

### 4. Create Pull Request

1. Visit your fork on GitHub
2. Click "Compare & pull request"
3. Fill out the PR template
4. Wait for review and feedback

## 📐 Coding Standards

### Backend Standards (Python)

For detailed backend guidelines, see: [**Backend Development Guidelines**](BACKEND_GUIDELINES.md)

**Key Points**:

- Follow PEP 8 style guide
- Use type annotations (Type Hints)
- Functions and classes need docstrings
- Use Ruff for linting and formatting
- Line length limit: 100 characters

**Quick Check**:

```bash
# Run linting
uv run ruff check .

# Auto-format code
uv run ruff format .
```

### Frontend Standards (TypeScript/React)

For detailed frontend guidelines, see: [**Frontend Development Guidelines**](FRONTEND_GUIDELINES.md)

**Key Points**:

- Use TypeScript strict mode
- Follow React Hooks best practices
- Use functional components
- Use ESLint for linting
- Use Tailwind CSS for styling

**Quick Check**:

```bash
cd free-todo-frontend

# Run ESLint
pnpm lint

# Build test
pnpm build
```

## 💬 Commit Message Guidelines

We use [Conventional Commits](https://www.conventionalcommits.org/) specification.

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Type

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation updates
- `style`: Code formatting (no code logic changes)
- `refactor`: Refactoring (neither new features nor bug fixes)
- `perf`: Performance optimization
- `test`: Adding tests
- `chore`: Build process or auxiliary tool changes
- `ci`: CI configuration changes
- `revert`: Revert previous commit

### Scope (Optional)

- `backend`: Backend related
- `frontend`: Frontend related
- `api`: API related
- `ui`: UI related
- `db`: Database related
- `config`: Configuration related

### Examples

```bash
# New feature
git commit -m "feat(frontend): add dark mode toggle button"

# Bug fix
git commit -m "fix(backend): resolve screenshot capture error on Windows"

# Documentation update
git commit -m "docs: update installation guide"

# Performance optimization
git commit -m "perf(api): improve vector search performance"

# Multi-line commit message
git commit -m "feat(backend): add task auto-association

- Implement background job for task context mapping
- Add configuration options for auto-association
- Update API endpoints to support new feature

Closes #123"
```

## 🔍 Pull Request Guidelines

### PR Title

PR titles should follow the same convention as commit messages:

```
<type>(<scope>): <description>
```

### PR Description Template

```markdown
## 📝 Description
<!-- Briefly describe the purpose and content of this PR -->

## 🔗 Related Issues
<!-- Link related issues, e.g., Closes #123 -->

## 🎯 Type of Change
<!-- Check applicable options -->
- [ ] Bug fix
- [ ] New feature
- [ ] Performance optimization
- [ ] Code refactoring
- [ ] Documentation update
- [ ] Test related
- [ ] Other (please specify)

## 🧪 Testing
<!-- Describe how to test these changes -->
- [ ] Tested locally
- [ ] Added unit tests
- [ ] Added integration tests
- [ ] Updated documentation

## 📸 Screenshots (if applicable)
<!-- Provide screenshots for UI-related changes -->

## ✅ Checklist
- [ ] Code follows project coding standards
- [ ] Performed self-review of code
- [ ] Code has appropriate comments
- [ ] Updated relevant documentation
- [ ] Changes generate no new warnings
- [ ] Added tests proving fix/feature works
- [ ] New and existing unit tests pass locally
- [ ] Dependent changes have been merged

## 📚 Additional Notes
<!-- Any other information reviewers should know -->
```

### Review Process

1. **Automated Checks**: CI/CD runs tests and checks
2. **Code Review**: Maintainers review your code
3. **Feedback**: Address feedback and make changes
4. **Merge**: After approval, maintainers merge your PR

### Review Standards

- ✅ Code quality and readability
- ✅ Follow project coding standards
- ✅ Feature completeness
- ✅ Test coverage
- ✅ Documentation completeness
- ✅ Performance impact
- ✅ Backward compatibility

## 🐛 Reporting Issues

### Bug Reports

When creating a bug report, include:

1. **Issue Description**: Clear and concise description
2. **Reproduction Steps**: Step-by-step instructions
3. **Expected Behavior**: What you expected to happen
4. **Actual Behavior**: What actually happened
5. **Environment Information**:
   - OS: [e.g., Windows 11, macOS 13.0, Ubuntu 22.04]
   - Python Version: [e.g., 3.12.0]
   - Node.js Version: [e.g., 20.0.0]
   - Browser: [e.g., Chrome 120.0]
6. **Screenshots/Logs**: If applicable
7. **Additional Context**: Any other relevant information

### Feature Requests

When creating a feature request, include:

1. **Feature Description**: Clear description of the feature
2. **Problem Context**: What problem does it solve?
3. **Proposed Solution**: How do you expect it to work?
4. **Alternatives**: Other solutions you've considered
5. **Use Cases**: Specific usage examples
6. **Additional Context**: Any other relevant information

## 💬 Community

### Getting Help

- **GitHub Issues**: Report issues and request features
- **GitHub Discussions**: Participate in community discussions
- **WeChat Group**: Join our WeChat group (see README)
- **Feishu Group**: Join our Feishu group (see README)

### Stay Connected

- 🌟 Star the project to show support
- 👀 Watch the repository for updates
- 🐦 Share the project on social media
- 📝 Write blog posts about the project

## 🎓 Learning Resources

### Backend

- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [SQLAlchemy Documentation](https://docs.sqlalchemy.org/)
- [Pydantic Documentation](https://docs.pydantic.dev/)
- [Python Type Hints](https://docs.python.org/3/library/typing.html)

### Frontend

- [Next.js Documentation](https://nextjs.org/docs)
- [React Documentation](https://react.dev/)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)

### Git

- [FreeTodo Git Flow Workflow](GIT_FLOW.md) - Project-specific Git workflow documentation
- [Git Guide](https://rogerdudler.github.io/git-guide/)
- [Git and GitHub Tutorial](https://www.freecodecamp.org/news/git-and-github-for-beginners/)

## 📊 Contributors

Thanks to all the people who have contributed to FreeTodo!

![Contributors](https://contrib.rocks/image?repo=FreeU-group/FreeTodo)

## ❓ FAQ

### I'm new to programming. Can I contribute?

Absolutely! We welcome contributors of all levels. You can start with:

- Fixing typos in documentation
- Improving documentation and comments
- Working on `good first issue` labeled issues
- Reporting bugs and suggesting improvements

### How long until my PR is reviewed?

We try to review PRs as quickly as possible, typically within 3-7 days. If there's no response after a week, please comment on your PR to remind us.

### Can I work on multiple issues at once?

Yes, but we recommend focusing on one issue at a time to ensure quality and efficiency.

### How do I keep my fork in sync with upstream?

```bash
# Fetch upstream updates
git fetch upstream

# Merge into local main branch
git checkout main
git merge upstream/main

# Push to your fork
git push origin main
```

### What if my PR is rejected?

Don't be discouraged! This is a normal part of the development process. Maintainers will provide feedback and suggestions. Address the feedback, or seek clarification in the discussion.

## 📜 License

FreeTodo is licensed under the **FreeU Community License**, which is based on Apache License 2.0 with additional terms regarding commercial use.

By contributing code, you agree:

1. **Your contributions will be licensed under the FreeU Community License**
   - This license is based on Apache License 2.0, with additional commercial use terms
   - For detailed license terms, please refer to the [LICENSE](../LICENSE) file

2. **As a contributor, you agree that:**
   - The producer may adjust the open source license as needed (making it more strict or more permissive)
   - Your contributed code may be used for commercial purposes, including but not limited to cloud versions

For detailed license terms and contributor conditions, please refer to the [LICENSE](../LICENSE) file.

---

## 🙏 Thanks

Thank you for taking the time to read our contribution guidelines! We look forward to your contributions to make FreeTodo better!

If you have any questions, feel free to ask in Issues or join our community groups.

Happy Coding! 🎉
