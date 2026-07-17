# Contributing to JCN

First off, thank you for considering contributing to JCN — it means a lot. This project only gets better with more hands on it, and we'd love yours.

This guide covers everything you need to go from "I want to help" to your first merged PR.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Ways to Contribute](#ways-to-contribute)
- [Development Setup](#development-setup)
- [Branching & Commit Conventions](#branching--commit-conventions)
- [Coding Standards](#coding-standards)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Features](#suggesting-features)
- [Getting Help](#getting-help)

## Code of Conduct

This project follows our [Code of Conduct](./CODE_OF_CONDUCT.md). By participating, you agree to uphold it. Be kind, be respectful, and assume good intent.

## Ways to Contribute

You don't have to write code to contribute meaningfully:

- 🐛 **Report bugs** — see [Reporting Bugs](#reporting-bugs)
- 💡 **Suggest features** — see [Suggesting Features](#suggesting-features)
- 📝 **Improve documentation** — typos, unclear setup steps, missing examples
- 🧪 **Write tests** — we always want better coverage
- 🎨 **Improve UI/UX** — design feedback and PRs are welcome
- 🔧 **Fix issues** — check issues labeled [`good first issue`](https://github.com/Profysr/JCN/labels/good%20first%20issue) or [`help wanted`](https://github.com/Profysr/JCN/labels/help%20wanted)
- 🌍 **Translations** — if you'd like to help localize JCN, open an issue first so we can coordinate

## Development Setup

1. **Fork** the repo (click **Fork** at the top of [github.com/Profysr/JCN](https://github.com/Profysr/JCN))

2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/YOUR-USERNAME/JCN.git
   cd JCN
   ```

3. **Add the original repo as upstream** (so you can pull in future updates):
   ```bash
   git remote add upstream https://github.com/Profysr/JCN.git
   ```

4. **Set up the project** — follow the [Quick Start](./README.md#quick-start) section in the README (Docker is the fastest path).

5. **Verify everything works** before making changes:
   ```bash
   docker-compose up --build
   ```
   Confirm the frontend loads at `http://localhost:5173` and the API docs load at `http://localhost:8000/api/docs/`.

## Branching & Commit Conventions

**Branch naming:**
```
feature/short-description     # new features
fix/short-description         # bug fixes
docs/short-description        # documentation only
refactor/short-description    # code changes with no behavior change
```
Example: `feature/leave-approval-flow`, `fix/kanban-drag-drop-bug`

**Commit messages** — we loosely follow [Conventional Commits](https://www.conventionalcommits.org/):
```
feat: add leave approval workflow
fix: correct timezone bug in attendance calendar
docs: update Google OAuth setup steps
refactor: simplify workspace permission checks
test: add coverage for invite acceptance flow
```

Keep commits focused — one logical change per commit is easier to review than one giant commit touching ten files.

## Coding Standards

**Backend (Django/Python):**
- Follow [PEP 8](https://peps.python.org/pep-0008/); we lint with `flake8` (max line length 120)
- Run before committing:
  ```bash
  cd backend
  flake8 . --max-line-length=120 --exclude=migrations,venv
  ```
- Write tests for new views, serializers, and business logic in the relevant app's `tests.py`
- Run tests locally:
  ```bash
  python manage.py test
  ```

**Frontend (React/Vite):**
- Follow the existing ESLint config (`.eslintrc.json`)
- Run before committing:
  ```bash
  cd frontend
  npm run lint
  ```
- Keep components small and focused; prefer composition over deeply nested conditional rendering
- Match existing Tailwind conventions already used in the codebase rather than introducing custom CSS

**General:**
- No commented-out dead code in PRs
- No secrets, API keys, or `.env` files committed — double check with `git diff` before pushing
- Update relevant documentation (README, docstrings, API docs) if your change affects it

## Submitting a Pull Request

1. Create your branch from the latest `main`:
   ```bash
   git checkout main
   git pull upstream main
   git checkout -b feature/your-feature-name
   ```

2. Make your changes, commit them, and push to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

3. Open a Pull Request against `Profysr/JCN:main`. Fill out the PR template — describe **what** changed and **why**, and link any related issue (e.g. `Closes #42`).

4. Ensure CI passes (lint + tests run automatically on every PR).

5. A maintainer will review your PR. We may ask for changes — this is normal and not a rejection. Once approved, we'll merge it.

**PR checklist before requesting review:**
- [ ] Code follows the style guidelines above
- [ ] Tests added/updated for the change (backend)
- [ ] `npm run lint` / `flake8` pass with no errors
- [ ] Docs updated if behavior or setup steps changed
- [ ] PR description explains the change and links any related issue

## Reporting Bugs

Before opening a new issue, please search [existing issues](https://github.com/Profysr/JCN/issues) to avoid duplicates.

When filing a bug report, include:
- Clear steps to reproduce
- Expected vs. actual behavior
- Screenshots if it's a UI issue
- Your environment (OS, browser, Docker vs local setup)

Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md) — it's pre-filled with the fields we need.

## Suggesting Features

Open a [feature request](.github/ISSUE_TEMPLATE/feature_request.md) describing:
- The problem you're trying to solve (not just the solution)
- Who benefits from this (which user type, which workflow)
- Any alternatives you've considered

For larger features, it's worth opening an issue to discuss the approach *before* investing time in a full implementation — saves you a rewrite if the direction needs adjusting.

## Getting Help

- Check the [README](./README.md) and [docs/](./docs) folder first
- Search [existing issues](https://github.com/Profysr/JCN/issues) and [Discussions](https://github.com/Profysr/JCN/discussions)
- Still stuck? Open a new [Discussion](https://github.com/Profysr/JCN/discussions) — we're happy to help you get unblocked

---

Thanks again for contributing — every PR, issue, and suggestion helps make JCN better for teams who need it. 🙌
