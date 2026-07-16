## Summary

Brief description of the changes.

## Safety Checklist

- [ ] Does not expose fund transfer or bank operations
- [ ] Does not enable bulk operations without safeguards
- [ ] Order-related changes require explicit parameters (no dangerous defaults)
- [ ] `docs/ACCESS_CONTROLS.md` updated if adding new operations

## Testing

- [ ] `npx vitest run` passes
- [ ] `bun run typecheck` passes
- [ ] `bun run check` passes
- [ ] New tests added for new functionality
