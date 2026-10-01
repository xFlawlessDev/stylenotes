/**
 * The contract version, exported as code so both repos can assert against it.
 *
 * This must equal `packages/shared/package.json`'s `version`
 * (`src/lib/shared-version.test.ts` enforces it in the public repo). When the
 * cloud repo pins `@stylenotes/shared` to a version, this is the value it is
 * pinning — bump it in lockstep with the package version.
 */
export const SHARED_CONTRACT_VERSION = '0.1.0';
