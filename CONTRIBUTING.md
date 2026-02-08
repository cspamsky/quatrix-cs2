# Contributing to Quatrix

Thank you for your interest in contributing to Quatrix. This document provides guidelines and instructions for contributing to the project.

Quatrix is a CS2 server management panel built for server administrators, developers, and DevOps engineers. Contributions that improve functionality, performance, security, or documentation are welcome.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How to Report Bugs](#how-to-report-bugs)
- [How to Suggest Features](#how-to-suggest-features)
- [Development Setup](#development-setup)
- [Branching Strategy](#branching-strategy)
- [Commit Message Guidelines](#commit-message-guidelines)
- [Pull Request Process](#pull-request-process)
- [Code Style Guidelines](#code-style-guidelines)
- [Security and Responsible Disclosure](#security-and-responsible-disclosure)
- [Communication Guidelines](#communication-guidelines)

---

## Code of Conduct

By participating in this project, you agree to maintain a respectful, constructive, and professional environment. We expect all contributors to:

- Be respectful of differing viewpoints and experiences
- Accept constructive criticism gracefully
- Focus on what is best for the project and community
- Show empathy towards other community members

Unacceptable behavior includes harassment, trolling, personal attacks, or any conduct that would be inappropriate in a professional setting.

---

## How to Report Bugs

Before submitting a bug report, please:

1. **Search existing issues** to avoid duplicates
2. **Verify the issue** on the latest version of Quatrix
3. **Gather relevant information** about your environment

When creating a bug report, include:

- **Description**: Clear and concise summary of the issue
- **Steps to reproduce**: Detailed steps to trigger the bug
- **Expected behavior**: What you expected to happen
- **Actual behavior**: What actually happened
- **Environment details**:
  - OS version (e.g., Ubuntu 22.04)
  - Node.js version (`node --version`)
  - CS2 server version
  - Quatrix version or commit hash
- **Logs**: Relevant error messages from:
  - `journalctl -u quatrix -n 100`
  - Browser console (F12 → Console tab)
  - CS2 server logs
- **Screenshots or videos** (if applicable)

Use the bug report template if available, or structure your issue clearly with the above information.

---

## How to Suggest Features

Feature requests are tracked as GitHub issues. When suggesting a feature:

1. **Check existing issues** to see if it has been proposed
2. **Explain the use case**: Why is this feature needed?
3. **Describe the solution**: What should the feature do?
4. **Consider alternatives**: Are there other ways to achieve this?
5. **Assess scope**: Is this a core feature or a plugin/extension?

Keep in mind:

- Features should align with Quatrix's goal of being a lightweight CS2 server management panel
- Proposals requiring significant architectural changes may take longer to review
- Community feedback and discussion are encouraged before implementation

---

## Development Setup

### Prerequisites

- Node.js 20.6.0 or higher
- npm 10.x or higher
- Git
- A Linux environment (or WSL2 for Windows development)
- Basic knowledge of React, TypeScript, Node.js, and CS2 server administration

### Local Setup

1. **Fork the repository** on GitHub

2. **Clone your fork**:

   ```bash
   git clone https://github.com/YOUR_USERNAME/quatrix.git
   cd quatrix
   ```

3. **Install dependencies**:

   ```bash
   npm install
   cd client && npm install && cd ..
   ```

4. **Configure environment**:

   ```bash
   cp .env.example .env
   # Edit .env with your local settings
   ```

5. **Run in development mode**:

   Terminal 1 (Backend):

   ```bash
   npm run dev
   ```

   Terminal 2 (Frontend):

   ```bash
   cd client
   npm run dev
   ```

6. **Access the panel**:
   - Frontend: `http://localhost:5173`
   - Backend API: `http://localhost:3001`

### Building for Production

```bash
cd client
npm run build
cd ..
npm start
```

---

## Branching Strategy

- **`main`**: Stable production-ready code
- **`dev`**: Active development branch (if applicable)
- **Feature branches**: `feature/your-feature-name`
- **Bug fixes**: `fix/issue-description`
- **Documentation**: `docs/what-you-are-documenting`

### Workflow

1. Create a branch from `main`:

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes and commit regularly

3. Push to your fork:

   ```bash
   git push origin feature/your-feature-name
   ```

4. Open a pull request against the `main` branch

---

## Commit Message Guidelines

Use **conventional commits** format for clear and consistent history:

```
<type>: <short description>

<optional body>

<optional footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, no logic change)
- `refactor`: Code refactoring (no feature or bug fix)
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Maintenance tasks (dependencies, build config)

### Examples

```
feat: add workshop map downloader integration

fix: resolve RCON connection timeout on server restart

docs: update installation instructions for Debian 12

refactor: extract player service into separate module
```

### Guidelines

- Use imperative mood ("add feature" not "added feature")
- Keep the first line under 72 characters
- Reference issue numbers when applicable (e.g., `fix: resolve #123`)
- Write in English

---

## Pull Request Process

1. **Ensure your code builds**:

   ```bash
   cd client && npm run build && cd ..
   npx tsc --noEmit
   ```

2. **Follow code style guidelines** (see below)

3. **Update documentation** if your changes affect:
   - API endpoints
   - Configuration options
   - User-facing features
   - Installation or setup process

4. **Write a clear PR description**:
   - What does this PR do?
   - Why is this change needed?
   - How was it tested?
   - Are there any breaking changes?
   - Screenshots (for UI changes)

5. **Link related issues**: Use keywords like `Closes #123` or `Fixes #456`

6. **Be responsive to feedback**: Address review comments promptly and professionally

7. **Keep commits clean**:
   - Squash trivial commits (e.g., "fix typo", "oops")
   - Rebase on `main` if needed to resolve conflicts

### PR Checklist

- [ ] Code builds without errors
- [ ] No TypeScript errors (`npx tsc --noEmit`)
- [ ] Follows existing code style
- [ ] Documentation updated (if applicable)
- [ ] Tested locally
- [ ] Commit messages follow conventional commits
- [ ] PR description is clear and complete

---

## Code Style Guidelines

### General Principles

- **Readability over cleverness**: Write clear, maintainable code
- **Consistency**: Follow existing patterns in the codebase
- **Type safety**: Use TypeScript strict mode features
- **Error handling**: Always handle errors gracefully

### TypeScript

- Use strict typing (`strict: true` in `tsconfig.json`)
- Avoid `any` type; use `unknown` or proper types
- Define interfaces for data structures
- Use meaningful variable and function names

### Frontend (React)

- Use functional components with hooks
- Follow existing component structure in `client/src/components`
- Use Tailwind CSS utility classes (avoid inline styles)
- Maintain the glassmorphism design system
- Keep components focused and reusable

### Backend (Node.js/Express)

- Use async/await for asynchronous operations
- Protect sensitive endpoints with JWT middleware
- Validate user input before processing
- Use proper HTTP status codes
- Log errors with sufficient context

### Formatting

- Use Prettier for code formatting (config in `.prettierrc`)
- Use ESLint for linting (config in `eslint.config.js`)
- Run before committing:
  ```bash
  npm run lint
  npm run format
  ```

---

## Security and Responsible Disclosure

If you discover a security vulnerability, **do not open a public issue**.

Instead:

1. **Email the maintainer** at the contact provided in the repository
2. **Provide details**:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

3. **Allow time for a fix**: We will acknowledge your report within 48 hours and work on a patch

Security issues will be addressed with high priority. We appreciate responsible disclosure and will credit you in the release notes (unless you prefer to remain anonymous).

---

## Communication Guidelines

- **Be respectful**: Treat all contributors with courtesy
- **Be constructive**: Provide actionable feedback
- **Be patient**: Maintainers and contributors are often volunteers
- **Be clear**: Write in clear, concise language
- **Be professional**: Avoid off-topic discussions, memes, or spam

When disagreeing:

- Focus on the technical merits of the argument
- Assume good intent
- Seek to understand before being understood

---

## Questions or Need Help?

- **General questions**: Open a GitHub Discussion or issue
- **Development help**: Check existing issues or ask in a new issue
- **Documentation issues**: Submit a PR or open an issue

Thank you for contributing to Quatrix. Your efforts help make CS2 server management better for everyone.
