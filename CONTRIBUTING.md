# Contributing to @sendrin/sdk (Node.js & TypeScript SDK)

Thank you for your interest in contributing to the official Sendrin Node.js SDK!

## 📌 Repository Notice: Public Distribution Mirror

This repository is an official, public distribution mirror of our internal development codebase. 

- **Bug Reports & Feature Requests**: Please open an **[Issue](https://github.com/iitdeveloper-git/sendrin-node/issues)** here! We monitor and triage issues actively.
- **Pull Requests**: Pull Requests are welcome and reviewed directly on this repository. Once approved by our team, your changes will be cherry-picked into our internal codebase and included in the next tagged release, with full commit author attribution preserved.

---

## 🛠️ Local Development

### Prerequisites
- Node.js 18+ or 20+
- npm 9+

### Setup
```bash
# Clone the repository
git clone https://github.com/iitdeveloper-git/sendrin-node.git
cd sendrin-node

# Install dependencies
npm install
```

### Running Tests & Linting
```bash
# Run unit tests (Vitest)
npm test

# Check code formatting & types
npm run lint
npm run build
```

---

## 📐 Guidelines

1. **Keep it minimal & typed**: Ensure all new options, error classes, and responses have comprehensive TypeScript types.
2. **Defensive API handling**: Network calls should enforce timeouts and retry only idempotent network/5xx failures with exponential backoff (never retry 429 quota exhaustion).
3. **No breaking changes**: Keep public method signatures backwards-compatible.
4. **Add tests**: Add unit tests in `src/*.test.ts` verifying any bug fix or new capability.

---

## 📄 License
By contributing to `@sendrin/sdk`, you agree that your contributions will be licensed under the [MIT License](LICENSE).
