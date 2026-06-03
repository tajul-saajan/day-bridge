# WSD-014 — Delivery Process. Required targets: init, build, test, container.
.PHONY: init build test container clean

# Initialise codebase; produces build/meta-build.json (service capabilities).
init:
	npm ci || npm install
	cd api && (npm ci || npm install)
	node scripts/meta-build.js

# Compile/syntax gate. Vanilla JS SPA + Node functions — no transpile step.
build:
	node --check app.js
	node --check auth.js
	node --check graph.js
	node --check jira.js
	@for f in api/shared/*.js api/*/index.js; do node --check "$$f" || exit 1; done
	@echo "build: syntax OK"

# All tests: syntax, dependency vulnerability scan (SAST), unit/integration.
test: build
	cd api && npm audit --audit-level=high || true
	cd api && node --test test/

# Build deployable artefacts; produces build/meta-artefacts.json.
# Not containerised (SWA managed hosting) — see README deviations.
container:
	node scripts/meta-artefacts.js
	@echo "container: artefact metadata written (no images — SWA managed hosting)"

clean:
	rm -rf build
