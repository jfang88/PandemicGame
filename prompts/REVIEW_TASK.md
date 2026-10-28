# Independent review prompt

```text
Review task Txx in jfang88/PandemicGame against its spec and acceptance
criteria. Read the diff and run the relevant tests yourself. Do not rely
solely on the implementation agent's summary or generated snapshots.

Prioritize incorrect rules, concurrency across await boundaries, partial
commits, duplicate retries, hidden-state leakage, JWT verification,
cross-room access, test bypass deployment, and hibernation recovery.
Check that tests exercise real boundaries and include failing inputs.
For rule tests, derive expected outcomes from RULES.md independently.

Return concrete findings with file/line, triggering scenario, impact,
and the smallest recommended correction. Separate blocking defects from
optional improvements. State exactly what you ran and could not verify.
Do not modify the PR or approve/merge automatically. If no blocking
findings, say so and list any remaining unverified release gates.
```
