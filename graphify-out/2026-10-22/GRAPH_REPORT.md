# Graph Report - bagdja-website-api  (2026-10-22)

## Corpus Check
- 346 files · ~116,273 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 14 file(s) not represented in the graph (top: (none) 12, .example 1, .toml 1)

## Summary
- 2962 nodes · 7009 edges · 181 communities (77 shown, 104 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 303 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `408d91ff`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Website Entity Ts
- Websites Module Ts
- Shipping Controller Ts
- ShippingClientService
- Websites Service Ts
- GatheringOccurrenceService
- Subscriptions Controller Ts
- Update Faq Dto Ts
- Update Location Dto Ts
- Format Expires At()
- Transactions Service Ts
- Use Guards
- Subscriptions Service Ts
- Update Category Dto Ts
- Use Interceptors
- Use Guards
- Transactions Gathering Guard Spec Ts
- Vendors Service Ts
- Wallet Service Ts
- Use Guards
- class-validator
- Update Gathering Plan Dto Ts
- TenantStaff
- With Gathering Manager()
- Use Guards
- Use Guards
- Normalize Escrow Status()
- WebsiteProduct
- API Components
- Use Guards
- Use Guards
- Update Date Column
- Website Product Asset
- Website Transaction
- Update Order Quantity Dto Ts
- Website Theme Ts
- Use Interceptors
- tenant-orders.controller.ts
- Use Interceptors
- API Components
- Website Transaction Item
- Gathering Validation Service Ts
- Jwt Auth Guard Ts
- API Components
- Use Guards
- Chat Service Client Ts
- Chat Module
- Verify Gathering Rsvp Otp Dto
- Tsconfig Root Dir
- pages.controller.ts
- Use Guards
- Websites Controller
- Website Products Website Id Id
- API Components
- orders.service.ts
- Use Guards
- @nestjs/swagger
- Use Interceptors
- Website Event Broadcaster Service Ts
- FulfillmentStepFormFieldDto
- CreateLocationDto
- Use Guards
- Validate Nested
- Website Chat Threads
- Update Blog Post Dto Ts
- Retained Rejected Registration History
- assets.service.ts
- Is Invitation Reference()
- Validate Nested
- Products Service
- Tsconfig Json
- User Subscription
- API Components
- Website Products
- websites.service.ts
- Templates Service
- Validate Nested
- Websites Module
- Website Event Registrations
- gathering-occurrence.service.ts
- Run Migration Ts
- Website Vendors
- Normalize Gathering Cancellation Policy()
- Validate Nested
- Website Orders
- Website Transactions
- MessagingService
- Primary Generated Column
- Update Date Column
- Storage Client Service
- Use Guards
- Public Gathering Invoice Controller Ts
- User Subscriptions
- Website Chat Thread
- Validate Nested
- Validate Nested
- Website Theme Dto
- Website Product Assets
- Website Blog Post Product
- Blog Posts Module
- Update Gathering Plan Dto
- Use Guards
- Health Module Ts
- Website Locations
- Website Transaction Fulfillment Logs
- Gathering Module
- API Components
- Website Blog Post
- Gathering Module
- Create Gathering Option Dto Ts
- Create Gathering Option Group Dto
- Wallet Module
- SetOrderQuoteDto
- chat-service.client.ts
- chat.controller.ts
- Assets Module
- Website Blog Posts
- Transactions Service Spec Ts
- Websites Service
- Source Root
- DigitalDeliveryService
- gathering-occurrence.service.ts
- CompleteFulfillmentStepDto
- Website Api Feature Modules
- Phase 5: Public Renderer Paywall
- Website Categories
- Websites Set Initial
- Transactions Module
- Website Notifications User Unread Idx
- FulfillmentFlowStep
- Plan Limit Enforcement
- Type Orm Query Layer
- GatheringOperation
- Per User Wallet And Subscription
- WebsiteNotification
- CreateGatheringPlanDto
- WebsiteEventRsvpChallenge
- UpdateGatheringInvitationContentDto
- GatheringPlanResponseDto

## God Nodes (most connected - your core abstractions)
1. `AuthUser` - 140 edges
2. `@nestjs/common` - 125 edges
3. `Roles()` - 113 edges
4. `CurrentUser` - 99 edges
5. `@nestjs/swagger` - 83 edges
6. `TransactionsService` - 82 edges
7. `typeorm` - 81 edges
8. `Website` - 70 edges
9. `GatheringOccurrenceService` - 70 edges
10. `@nestjs/typeorm` - 60 edges

## Surprising Connections (you probably didn't know these)
- `buildService()` --calls--> `TransactionsService`  [EXTRACTED]
  src/modules/transactions/transactions.return-origin.spec.ts → src/modules/transactions/transactions.service.ts
- `websites_set_initial` --triggers--> `websites`  [EXTRACTED]
  supabase/migrations/20261019000002_gathering_plan_numbers.sql → supabase/migrations/20250703000001_init.sql
- `idx_website_products_type` --indexes--> `website_products`  [EXTRACTED]
  supabase/migrations/20250706100001_master_data_refactor.sql → supabase/migrations/20250703000001_init.sql
- `idx_website_products_category_id` --indexes--> `website_products`  [EXTRACTED]
  supabase/migrations/20260806000001_add_website_categories.sql → supabase/migrations/20250703000001_init.sql
- `website_products_website_id_id_uidx` --indexes--> `website_products`  [EXTRACTED]
  supabase/migrations/20261013000001_gathering_preorder_plans.sql → supabase/migrations/20250703000001_init.sql

## Import Cycles
- 3-file cycle: `src/entities/website-category.entity.ts -> src/entities/website.entity.ts -> src/entities/website-product.entity.ts -> src/entities/website-category.entity.ts`

## Hyperedges (group relationships)
- **Five Phases of Subscription and Wallet Delivery** — subscription_implementasi_plan_fase_1_backend_setup, subscription_implementasi_plan_fase_2_frontend_admin, subscription_implementasi_plan_fase_3_plan_limit_enforcement, subscription_implementasi_plan_fase_4_ux_polish, subscription_implementasi_plan_fase_5_public_paywall [EXTRACTED 1.00]
- **Gathering Invitation, RSVP Verification, Rejection, and Billing Emails** — docs_gathering_invitation_email_template_gatheringinvitation, docs_gathering_rsvp_otp_email_template_gatheringrsvpotp, docs_gathering_rsvp_rejected_email_template_gatheringrsvprejected, docs_gathering_invoice_email_template_gatheringinvoice [INFERRED 0.85]

## Communities (181 total, 104 thin omitted)

### Community 0 - "Website Entity Ts"
Cohesion: 0.09
Nodes (21): typeorm, FulfillmentStepFormFieldFilledBy, GatheringOperationKind, GatheringOperationStatus, WebsiteChatThreadChannelType, WebsiteChatThreadStatus, Website, WebsiteNotificationSeverity (+13 more)

### Community 1 - "Websites Module Ts"
Cohesion: 0.06
Nodes (32): @nestjs/common, @nestjs/typeorm, AuthModule, ROLES_KEY, TenantRole, ROLE_HIERARCHY, CurrentStaff, WebsiteEventBroadcasterModule (+24 more)

### Community 2 - "Shipping Controller Ts"
Cohesion: 0.08
Nodes (8): GridMeta, GridQueryParams, GridResult, paginateQueryBuilder(), parseGridQuery(), PublicController, PublicService, effectiveWeightGrams()

### Community 3 - "ShippingClientService"
Cohesion: 0.10
Nodes (3): GetShippingCostDto, ShippingCalculationService, ShippingController

### Community 4 - "Websites Service Ts"
Cohesion: 0.04
Nodes (13): ChatServiceModule, FulfillmentFlow, WebsiteCategory, WebsiteFaq, WebsitePage, WebsiteSection, PublicModule, PRODUCT_SORTABLE_COLUMNS (+5 more)

### Community 5 - "GatheringOccurrenceService"
Cohesion: 0.06
Nodes (6): ConfirmGatheringEventDto, GatheringOccurrenceService, maskEmail(), buildPaymentOpenCancel(), buildPrivateRsvp(), buildService()

### Community 6 - "Subscriptions Controller Ts"
Cohesion: 0.08
Nodes (5): CancelSubscriptionDto, SubscribePlanDto, PlanLimitService, SubscriptionsController, SubscriptionsService

### Community 7 - "Update Faq Dto Ts"
Cohesion: 0.07
Nodes (5): CreateFaqDto, ReorderFaqsDto, UpdateFaqDto, FaqsController, FaqsService

### Community 9 - "Format Expires At()"
Cohesion: 0.08
Nodes (6): CreateInvitationDto, UpdateStaffDto, InvitationAcceptController, StaffController, formatExpiresAt(), StaffService

### Community 10 - "Transactions Service Ts"
Cohesion: 0.07
Nodes (18): WebsiteOrderTerminStatus, AddAdhocTerminDto, ListTerminsQueryDto, TerminCountResponseDto, TerminListItemDto, TerminListMetaDto, TerminListResponseDto, TRANSACTION_SYNC_STEPS (+10 more)

### Community 11 - "Use Guards"
Cohesion: 0.07
Nodes (4): CreateSectionDto, UpdateSectionDto, SectionsController, SectionsService

### Community 12 - "Subscriptions Service Ts"
Cohesion: 0.07
Nodes (21): @bagdja/node-sdk, @nestjs/config, @nestjs/testing, CoolifyApplication, BuyerWalletResult, CreateEscrowPayload, DirectPaymentStatus, InitializeEscrowPaymentPayload (+13 more)

### Community 13 - "Update Category Dto Ts"
Cohesion: 0.08
Nodes (4): CategoriesController, CategoriesService, CreateCategoryDto, UpdateCategoryDto

### Community 15 - "Use Guards"
Cohesion: 0.07
Nodes (3): CreatePageDto, PagesController, PagesService

### Community 16 - "Transactions Gathering Guard Spec Ts"
Cohesion: 0.14
Nodes (4): FulfillmentStepFormField, buildService(), OrderFulfillmentStepProgress, TransactionsService

### Community 17 - "Vendors Service Ts"
Cohesion: 0.09
Nodes (4): CreateVendorDto, UpdateVendorDto, VendorsController, VendorsService

### Community 18 - "Wallet Service Ts"
Cohesion: 0.08
Nodes (7): CreateTopupDto, WalletController, TopupResult, WalletBalance, WalletService, WalletTransaction, WalletTransactionsResult

### Community 20 - "class-validator"
Cohesion: 0.10
Nodes (6): class-transformer, class-validator, FinalGatheringOptionDto, AssignFulfillmentFlowByTypeDto, PAYMENT_MODES, PaymentMetaEntryDto

### Community 21 - "Update Gathering Plan Dto Ts"
Cohesion: 0.09
Nodes (4): @nestjs/platform-express, CollectiveGatheringCheckoutDto, RejectGatheringRegistrationsDto, UpdateGatheringInvitationDto

### Community 22 - "TenantStaff"
Cohesion: 0.07
Nodes (3): StaffInvitation, TenantStaff, User

### Community 23 - "With Gathering Manager()"
Cohesion: 0.10
Nodes (5): WebsiteOrder, getGatheringOrderMeta(), OrdersService, buildDraftService(), notificationsService

### Community 25 - "Use Guards"
Cohesion: 0.12
Nodes (3): CoolifyService, DomainsController, DomainsService

### Community 27 - "WebsiteProduct"
Cohesion: 0.08
Nodes (4): ProductUom, WebsiteProduct, WebsiteProductLocation, CheckoutPaymentMode

### Community 28 - "API Components"
Cohesion: 0.07
Nodes (29): description, prettier, name, private, version, eslint, eslint-config-prettier, eslint-plugin-import (+21 more)

### Community 29 - "Use Guards"
Cohesion: 0.05
Nodes (4): CreateFulfillmentFlowDto, FulfillmentFlowStepInputDto, FulfillmentFlowsController, FulfillmentFlowsService

### Community 31 - "Update Date Column"
Cohesion: 0.08
Nodes (4): GatheringOption, GatheringOptionGroup, GatheringOptionGroupService, GatheringOptionService

### Community 32 - "Website Product Asset"
Cohesion: 0.08
Nodes (3): WebsiteAsset, WebsiteOrderAssetDelivery, WebsiteProductAsset

### Community 33 - "Website Transaction"
Cohesion: 0.11
Nodes (3): WebsiteTransaction, EscrowSummary, normalizeEscrowStatus()

### Community 34 - "Update Order Quantity Dto Ts"
Cohesion: 0.13
Nodes (3): CreateOrderDto, ShippingAddressDto, UpdateOrderQuantityDto

### Community 35 - "Website Theme Ts"
Cohesion: 0.12
Nodes (22): BODY_WEIGHTS, extractTemplateTheme(), FONT_NAMES, HEADING_SCALES, HEADING_WEIGHTS, isThemeAccent(), isThemeMode(), isValidHex() (+14 more)

### Community 37 - "tenant-orders.controller.ts"
Cohesion: 0.19
Nodes (3): AssignVendorDto, CancelDraftOrderDto, DraftOrderCountResponseDto

### Community 39 - "API Components"
Cohesion: 0.08
Nodes (25): dependencies, @bagdja/node-sdk, bullmq, class-transformer, class-validator, dotenv, express-basic-auth, ioredis (+17 more)

### Community 40 - "Website Transaction Item"
Cohesion: 0.09
Nodes (3): WebsiteOrderTermin, WebsiteTransactionFulfillmentLog, WebsiteTransactionItem

### Community 41 - "Gathering Validation Service Ts"
Cohesion: 0.10
Nodes (3): CreateGatheringOccurrenceDto, CreateGatheringProductDto, GatheringValidationService

### Community 42 - "Jwt Auth Guard Ts"
Cohesion: 0.13
Nodes (5): jose, AuthMeResponse, AuthProfileService, OAuthAccessTokenPayload, UserService

### Community 43 - "API Components"
Cohesion: 0.17
Nodes (22): idx_staff_invitations_email, idx_staff_invitations_token, idx_staff_invitations_website_id, idx_tenant_staff_user_id, idx_tenant_staff_website_id, idx_website_pages_website_id, idx_website_sections_page_id, idx_websites_slug (+14 more)

### Community 47 - "Verify Gathering Rsvp Otp Dto"
Cohesion: 0.09
Nodes (3): SubmitGatheringRsvpDto, SubmitPrivateGatheringRsvpDto, VerifyGatheringRsvpOtpDto

### Community 48 - "Tsconfig Root Dir"
Cohesion: 0.10
Nodes (20): env, es2021, node, extends, ignorePatterns, prettier, parser, parserOptions (+12 more)

### Community 52 - "Website Products Website Id Id"
Cohesion: 0.17
Nodes (17): idx_users_email, idx_users_username, users, users_updated_at, idx_website_event_groups_initiator, idx_website_gathering_occurrences_unscheduled, update_website_event_groups_updated_at, update_website_gathering_occurrences_updated_at (+9 more)

### Community 53 - "API Components"
Cohesion: 0.10
Nodes (20): devDependencies, eslint, eslint-config-prettier, eslint-plugin-import, jest, @nestjs/cli, @nestjs/schematics, @nestjs/testing (+12 more)

### Community 54 - "orders.service.ts"
Cohesion: 0.07
Nodes (3): WebsiteLocation, WebsiteVendor, WebsiteVendorLocation

### Community 56 - "@nestjs/swagger"
Cohesion: 0.11
Nodes (7): @nestjs/swagger, JwtAuthGuard, RolesGuard, TenantStaffGuard, UpdateFulfillmentFlowDto, ReorderSectionsDto, AcceptInvitationDto

### Community 58 - "Website Event Broadcaster Service Ts"
Cohesion: 0.14
Nodes (9): WebsiteChatChannelType, WebsiteChatMessageCreatedEventPayload, WebsiteChatSenderType, WebsiteChatThreadCreatedEventPayload, WebsiteChatUnreadUpdatedEventPayload, WebsiteEventBroadcasterService, WebsiteNotificationCreatedEventPayload, WebsiteNotificationEventType (+1 more)

### Community 63 - "Website Chat Threads"
Cohesion: 0.16
Nodes (14): idx_website_chat_messages_author_user_id, idx_website_chat_messages_thread_id, idx_website_chat_threads_channel_type, idx_website_chat_threads_customer_user_id, idx_website_chat_threads_status, idx_website_chat_threads_website_id, website_chat_messages, website_chat_threads (+6 more)

### Community 65 - "Retained Rejected Registration History"
Cohesion: 0.11
Nodes (18): Gathering Invitation Email Template Documentation, GatheringInvitation Email Template, Invitation Link Expiry and Recipient Restriction, Private Invitation Email Delivery, Gathering Invoice Email Template Documentation, Escrow Checkout for Gathering Invoices, GatheringInvoice Email Template, Invoice Order-Link Fallback (+10 more)

### Community 70 - "Tsconfig Json"
Cohesion: 0.11
Nodes (17): compilerOptions, allowSyntheticDefaultImports, declaration, emitDecoratorMetadata, experimentalDecorators, forceConsistentCasingInFileNames, incremental, module (+9 more)

### Community 72 - "API Components"
Cohesion: 0.12
Nodes (17): scripts, build, db:migrate, db:push, db:reset, db:start, db:stop, lint (+9 more)

### Community 73 - "Website Products"
Cohesion: 0.15
Nodes (12): idx_website_products_website_id, website_products, idx_website_products_category, idx_website_products_slug, idx_website_products_parent_product_id, idx_website_products_uom_id, product_uoms, idx_website_event_product_options_group_key (+4 more)

### Community 74 - "websites.service.ts"
Cohesion: 0.13
Nodes (4): WebsiteTemplate, EffectivePlanLimits, FREE_PLAN_LIMITS, TemplatesModule

### Community 77 - "Websites Module"
Cohesion: 0.24
Nodes (3): resolveSeedImages(), slugify(), WebsiteBootstrapService

### Community 78 - "Website Event Registrations"
Cohesion: 0.18
Nodes (10): idx_website_event_invitations_group_status, update_website_event_invitations_updated_at, uq_website_event_invitations_pending_email, uq_website_event_invitations_pending_whatsapp, website_event_invitations, idx_website_event_registrations_group_status, website_event_registrations, uq_website_event_registration_invitation_email (+2 more)

### Community 79 - "gathering-occurrence.service.ts"
Cohesion: 0.06
Nodes (11): @nestjs/bullmq, DatabaseModule, entities, GatheringOccurrence, GatheringOccurrenceStatus, GatheringSelectionSource, WebsiteEventGroup, WebsiteEventInvitation (+3 more)

### Community 80 - "Run Migration Ts"
Cohesion: 0.15
Nodes (6): dotenv, express-basic-auth, @nestjs/core, pg, reflect-metadata, AppModule

### Community 81 - "Website Vendors"
Cohesion: 0.24
Nodes (13): idx_website_orders_location_id, idx_website_orders_vendor_id, idx_website_product_locations_location_id, idx_website_product_locations_product_id, idx_website_vendor_locations_location_id, idx_website_vendor_locations_vendor_id, idx_website_vendors_website_id, update_website_product_locations_updated_at (+5 more)

### Community 82 - "Normalize Gathering Cancellation Policy()"
Cohesion: 0.24
Nodes (5): GatheringProductOptionsService, assertUniformGatheringOptionConfig(), assertValidGatheringProductConfig(), CancellationPolicyInput, normalizeGatheringCancellationPolicy()

### Community 83 - "Validate Nested"
Cohesion: 0.23
Nodes (3): CheckoutShippingSelectionDto, CreateTransactionCheckoutDto, TransactionShippingAddressDto

### Community 84 - "Website Orders"
Cohesion: 0.23
Nodes (10): idx_website_orders_buyer_user_id, idx_website_orders_escrow_id, idx_website_orders_website_id, update_website_orders_updated_at, website_orders, idx_website_order_termins_source_order_id, idx_website_order_termins_website_id, website_order_termins (+2 more)

### Community 85 - "Website Transactions"
Cohesion: 0.26
Nodes (11): idx_website_orders_transaction_id, idx_website_transaction_items_order_id, idx_website_transaction_items_transaction_id, idx_website_transactions_buyer_user_id, idx_website_transactions_escrow_id, idx_website_transactions_status, idx_website_transactions_website_id, update_website_transactions_updated_at (+3 more)

### Community 92 - "User Subscriptions"
Cohesion: 0.29
Nodes (10): idx_subscription_plans_app_id, idx_subscription_plans_external_id, idx_subscription_plans_is_active, subscription_plans, idx_user_subscriptions_external_id, idx_user_subscriptions_plan_id, idx_user_subscriptions_status, idx_user_subscriptions_unique_active (+2 more)

### Community 96 - "Website Theme Dto"
Cohesion: 0.25
Nodes (3): ThemeColorsDto, ThemeTypographyDto, WebsiteThemeDto

### Community 97 - "Website Product Assets"
Cohesion: 0.35
Nodes (10): idx_website_assets_website_id_created_at, idx_website_order_asset_deliveries_order, idx_website_product_assets_asset_id, idx_website_product_assets_product_sort, update_website_assets_updated_at, update_website_order_asset_deliveries_updated_at, update_website_product_assets_updated_at, website_assets (+2 more)

### Community 103 - "Website Locations"
Cohesion: 0.33
Nodes (9): idx_website_faqs_category, idx_website_faqs_website_id, idx_website_locations_type, idx_website_locations_website_id, idx_website_products_type, trg_website_faqs_updated_at, trg_website_locations_updated_at, website_faqs (+1 more)

### Community 104 - "Website Transaction Fulfillment Logs"
Cohesion: 0.36
Nodes (9): fulfillment_flow_steps, fulfillment_flows, idx_fulfillment_flow_steps_flow_id, idx_fulfillment_flows_website_id, idx_fulfillment_logs_order_id, idx_fulfillment_logs_transaction_id, update_fulfillment_flow_steps_updated_at, update_fulfillment_flows_updated_at (+1 more)

### Community 106 - "API Components"
Cohesion: 0.22
Nodes (9): jest, collectCoverageFrom, coverageDirectory, moduleFileExtensions, rootDir, testEnvironment, testRegex, transform (+1 more)

### Community 111 - "Wallet Module"
Cohesion: 0.25
Nodes (9): Admin Billing Dashboard, Idempotent Auto-Subscribe Free Plan, Subscription and Wallet Implementation Plan, Subscription Ownership Assertion, POS Production Blueprint Adoption, Public Website Subscription Paywall, Three-Layer Subscription and Wallet Architecture, Subscriptions Module (+1 more)

### Community 113 - "chat-service.client.ts"
Cohesion: 0.22
Nodes (7): ChatContextMetadataItem, ChatDirectTopicResponse, ChatMessageListResponse, ChatMessageReceiptSummary, ChatMessageResponse, ChatReadStateItem, ChatTopicResponse

### Community 114 - "chat.controller.ts"
Cohesion: 0.18
Nodes (3): CreateCustomerWebsiteChatThreadDto, CreateWebsiteChatThreadDto, SendWebsiteChatMessageDto

### Community 116 - "Website Blog Posts"
Cohesion: 0.39
Nodes (6): idx_website_blog_posts_published, idx_website_blog_posts_website_id, website_blog_posts, idx_website_blog_post_products_order, idx_website_blog_post_products_product, website_blog_post_products

### Community 117 - "Transactions Service Spec Ts"
Cohesion: 0.33
Nodes (4): buildService(), PAID_ORDER_TRANSACTION_STATUSES, setup(), terminRow

### Community 119 - "Source Root"
Cohesion: 0.33
Nodes (5): collection, compilerOptions, deleteOutDir, $schema, sourceRoot

### Community 121 - "gathering-occurrence.service.ts"
Cohesion: 0.17
Nodes (15): bullmq, resolvePaymentMode(), SeatCancelSettlement, DISPATCH_GATHERING_INVITATIONS_JOB, GATHERING_OPERATIONS_QUEUE, ISSUE_GATHERING_INVOICES_JOB, OPERATION_ENQUEUE_TIMEOUT_MS, QUEUED_OPERATION_STALE_MS (+7 more)

### Community 123 - "Website Api Feature Modules"
Cohesion: 0.40
Nodes (5): Bagdja Website API Overview, ClientAppGuard Feature Protection, Health Endpoint, NestJS Website API Backend, Website API Feature Modules

### Community 124 - "Phase 5: Public Renderer Paywall"
Cohesion: 0.40
Nodes (5): Phase 1: Backend Setup, Phase 2: Frontend Admin, Phase 3: Plan Limit Enforcement, Phase 4: UX Polish, Phase 5: Public Renderer Paywall

### Community 125 - "Website Categories"
Cohesion: 0.60
Nodes (4): idx_website_categories_website_id, idx_website_products_category_id, trg_website_categories_updated_at, website_categories

### Community 127 - "Transactions Module"
Cohesion: 0.50
Nodes (3): buildService(), PROD_ENV, website

### Community 128 - "Website Notifications User Unread Idx"
Cohesion: 0.83
Nodes (3): website_notifications, website_notifications_user_created_idx, website_notifications_user_unread_idx

### Community 130 - "Plan Limit Enforcement"
Cohesion: 0.67
Nodes (3): Default Free Plan Limits, Local Subscription Cache for Plan-Limit Enforcement, Plan Limit Enforcement

## Knowledge Gaps
- **55 isolated node(s):** `plugin:@typescript-eslint/recommended`, `prettier`, `@nestjs/jwt`, `@nestjs/passport`, `@supabase/supabase-js` (+50 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1290 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **104 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `@nestjs/common` connect `Websites Module Ts` to `Website Entity Ts`, `ShippingClientService`, `Websites Service Ts`, `Subscriptions Controller Ts`, `Update Faq Dto Ts`, `Transactions Service Ts`, `Subscriptions Service Ts`, `Update Category Dto Ts`, `Vendors Service Ts`, `Wallet Service Ts`, `class-validator`, `Update Gathering Plan Dto Ts`, `TenantStaff`, `WebsiteProduct`, `API Components`, `Update Order Quantity Dto Ts`, `tenant-orders.controller.ts`, `Gathering Validation Service Ts`, `Jwt Auth Guard Ts`, `Verify Gathering Rsvp Otp Dto`, `pages.controller.ts`, `@nestjs/swagger`, `Website Event Broadcaster Service Ts`, `CreateLocationDto`, `Update Blog Post Dto Ts`, `assets.service.ts`, `websites.service.ts`, `gathering-occurrence.service.ts`, `Run Migration Ts`, `Normalize Gathering Cancellation Policy()`, `Public Gathering Invoice Controller Ts`, `Health Module Ts`, `chat-service.client.ts`, `chat.controller.ts`, `Transactions Service Spec Ts`, `gathering-occurrence.service.ts`?**
  _High betweenness centrality (0.109) - this node is a cross-community bridge._
- **What connects `plugin:@typescript-eslint/recommended`, `prettier`, `@nestjs/jwt` to the rest of the system?**
  _55 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Website Entity Ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08531746031746032 - nodes in this community are weakly interconnected._
- **Why does `Roles()` connect `Use Guards` to `Websites Module Ts`, `Update Faq Dto Ts`, `Update Location Dto Ts`, `Format Expires At()`, `Transactions Service Ts`, `Use Guards`, `Update Category Dto Ts`, `Use Guards`, `Vendors Service Ts`, `class-validator`, `Use Guards`, `Use Guards`, `Use Guards`, `Use Interceptors`, `tenant-orders.controller.ts`, `Use Guards`, `pages.controller.ts`, `Websites Controller`, `Use Guards`, `@nestjs/swagger`, `CreateLocationDto`, `Update Blog Post Dto Ts`, `assets.service.ts`, `gathering-occurrence.service.ts`, `Use Guards`?**
  _High betweenness centrality (0.089) - this node is a cross-community bridge._
- **Should `Websites Module Ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05806858826004629 - nodes in this community are weakly interconnected._
- **Why does `AuthUser` connect `Use Interceptors` to `Website Entity Ts`, `Websites Module Ts`, `ShippingClientService`, `GatheringOccurrenceService`, `Subscriptions Controller Ts`, `Format Expires At()`, `Transactions Service Ts`, `Use Interceptors`, `Wallet Service Ts`, `Use Guards`, `Update Gathering Plan Dto Ts`, `TenantStaff`, `With Gathering Manager()`, `Normalize Escrow Status()`, `Website Transaction`, `Update Order Quantity Dto Ts`, `Use Interceptors`, `Jwt Auth Guard Ts`, `Chat Module`, `Verify Gathering Rsvp Otp Dto`, `Use Guards`, `Websites Controller`, `@nestjs/swagger`, `Use Interceptors`, `Use Guards`, `assets.service.ts`, `Is Invitation Reference()`, `Storage Client Service`, `Use Guards`, `chat.controller.ts`, `Assets Module`, `gathering-occurrence.service.ts`?**
  _High betweenness centrality (0.077) - this node is a cross-community bridge._
- **Should `Shipping Controller Ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08350168350168351 - nodes in this community are weakly interconnected._