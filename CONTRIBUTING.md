# Contributing

Thanks for your interest. Mod Orchestrator is open source under the [GPL-3.0-or-later](LICENSE).

## License of contributions

By opening a pull request you agree that your contribution is licensed under the same license as the project (GPL-3.0-or-later). There is no CLA. Only submit code you wrote, or code under a GPL-3.0-compatible license with its original attribution kept.

**Exception: `dettmann-ui`.** What you contribute to the `dettmann-ui/` folder is licensed under the GPL-3.0-or-later **and also** under the [MIT license](https://opensource.org/license/mit), with you as the copyright holder. `dettmann-ui` is a UI library the project author also uses outside Mod Orchestrator, and the MIT license on contributions allows that. Mod Orchestrator as a whole stays under the GPL-3.0-or-later. If you do not want to license under MIT, do not change that folder in your pull request.

## Build and test

Prerequisites and steps in [README.md › Development](README.md#development). Everything needed is in the repository, including `dettmann-ui` (`dettmann-ui/`).

To test someone else's pull request:

```bash
gh pr checkout <number>
```

Then build `dettmann-ui` and run `wails dev` (or `wails build`), as in the README. An executable built on your machine does not trigger the SmartScreen warning; artifacts downloaded from a pull request's CI are unsigned and do.

To keep your real data apart, set `MODORCHESTRATOR_DATA_DIR` to a test folder before running.

## Before opening the pull request

```bash
go vet ./... && go test ./...
```

```bash
npm --prefix frontend run typecheck && npm --prefix frontend test
```

```bash
wails build
```

CI runs the same checks (except `wails build`) on every pull request.

## Project rules

- The specification in `mod-orchestrator-spec-v2/` is a published snapshot of the maintainer's planning workspace, refreshed from time to time; it may lag behind `master`. Read [AGENTS.md](AGENTS.md) for the working rules (still in Portuguese).
- Layers: `internal/core/domain` <- `internal/core/application` <- `internal/infrastructure` / `internal/adapters`. `go test ./internal` fails if the rule is broken.
- Anything that does not hold for every game comes in through an adapter capability, with a test using the `generic` adapter (without the capability). Game facts (names, files, extensions) live only in `internal/adapters` (D112).
- No business rules in React components; all UI uses `dettmann-ui`; all UI text comes from i18n (en and pt-BR).
- If you change a contract, rule or behavior the spec does not cover, describe the decision (context, choice, alternatives) in the pull request; the maintainer records it and it reaches the spec in the next snapshot.
- New dependencies need a GPL-3.0-compatible license (D076).
- GitHub workflows: do not use `pull_request_target` and do not give secrets to jobs that run pull request code (D077).

## Security

Do not open a public issue for vulnerabilities. Use GitHub's private vulnerability reporting (the repository's Security tab).
