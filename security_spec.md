# Security Spec for Warehouse Management System

## Data Invariants
1. `inventory_transactions` must always be immutable after creation.
2. An inventory transaction can only reference a valid warehouse and product.
3. Access to warehouses, products, categories, suppliers, and customers is controlled by the user's role: Super Admin (all), Warehouse Manager (most), Warehouse Staff (specific).
4. `inventory` must accurately reflect the stock. Staff can only increment/decrement via valid operations.

## Roles
- Role is determined by the `role` field on the user document in `users/{userId}`.

## The Dirty Dozen Payloads
1. Create user with fake role (e.g. `Super Admin`) by a non-admin.
2. Edit `inventory_transactions` (should be prevented).
3. Shadow Update: Add a ghost field `isSuperAdmin: true` to a user profile update.
4. Value Poisoning: Setting `availableQty` to a string instead of number in `inventory`.
5. Spoof Attack: User creating a document masking `createdBy` as another user's ID.
6. Bypass Validation: Updating a product without categoryId.
7. Denial of Wallet: Inject a 20KB string into a note field in `inbounds`.
8. PII Leak: Querying all users' emails by a Staff role.
9. Orphaned Record: Create transaction for non-existent product.
10. System Shortcut: Changing stock opname status directly to `Completed` without `Draft` or `Approved`.
11. Size bounds bypass: Storing an array of 5,000 items in `inbounds.items`.
12. Identity Spoofing: Submitting an invalid `userId` in `audit_logs`.

## Rules Requirements
- Master Gate pattern checking user role in `users`.
- Validate all schema objects.
- Use strictly bounded arrays instead of subcollections for line items, because a DO/Inbound typically has a manageable number of items (limit to 100 items per doc).
