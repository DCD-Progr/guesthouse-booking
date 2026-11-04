# Access model and deployment review

The source repository is public by explicit owner instruction. GitHub access review found zero collaborators: public visitors may read/fork source but cannot push changes. Deployments are initiated through the owner-controlled manual workflow. No privileged keys or staff/travel records are present in the source.

Every operational table has RLS enabled. Anonymous users have no operational table grants or booking RPC execution rights. Authenticated table access is read-only and filtered by active profile/role. Writes use authorized database functions that validate current identity, role, request ownership and state. Roles cannot be chosen through signup or edited by requesters. Public self-signup and anonymous sign-in are disabled in the hosted Auth configuration.

Supabase intentionally flags the 14 authenticated SECURITY DEFINER entry points. They are the constrained API for RLS-protected operations, each validates authorization, and all helper functions remain non-executable by application roles. Switching them blindly to SECURITY INVOKER would break the deliberate no-direct-write design. Their search paths are fixed and they use no dynamic SQL. This is a reviewed architectural warning, not a claim that the advisor has no warnings.

Advisor reference: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

The btree_gist extension was moved to the extensions schema. Foreign-key indexes and per-statement role/identity evaluation were added after the deployment advisory review. New-project unused-index notices are expected and are not a reason to remove booking constraints.

Live Auth account/invitation delivery, production staff onboarding and restore acceptance still need testing with approved accounts before operational use.
