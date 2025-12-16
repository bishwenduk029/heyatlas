import { pgTable, index, foreignKey, unique, uuid, text, integer, timestamp, boolean, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const userRole = pgEnum("user_role", ['user', 'admin', 'super_admin'])


export const payments = pgTable("payments", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text().notNull(),
	customerId: text().notNull(),
	subscriptionId: text(),
	productId: text().notNull(),
	paymentId: text().notNull(),
	amount: integer().notNull(),
	currency: text().default('usd').notNull(),
	status: text().notNull(),
	paymentType: text().notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("payments_userId_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "payments_userId_users_id_fk"
		}).onDelete("cascade"),
	unique("payments_paymentId_unique").on(table.paymentId),
]);

export const accounts = pgTable("accounts", {
	id: text().primaryKey().notNull(),
	accountId: text().notNull(),
	providerId: text().notNull(),
	userId: text().notNull(),
	accessToken: text(),
	refreshToken: text(),
	idToken: text(),
	accessTokenExpiresAt: timestamp({ mode: 'string' }),
	refreshTokenExpiresAt: timestamp({ mode: 'string' }),
	scope: text(),
	password: text(),
	createdAt: timestamp({ mode: 'string' }).notNull(),
	updatedAt: timestamp({ mode: 'string' }).notNull(),
}, (table) => [
	index("accounts_userId_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "accounts_userId_users_id_fk"
		}).onDelete("cascade"),
]);

export const sessions = pgTable("sessions", {
	id: text().primaryKey().notNull(),
	expiresAt: timestamp({ mode: 'string' }).notNull(),
	token: text().notNull(),
	createdAt: timestamp({ mode: 'string' }).notNull(),
	updatedAt: timestamp({ mode: 'string' }).notNull(),
	ipAddress: text(),
	userAgent: text(),
	os: text(),
	browser: text(),
	deviceType: text(),
	userId: text().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "sessions_userId_users_id_fk"
		}).onDelete("cascade"),
	unique("sessions_token_unique").on(table.token),
]);

export const subscriptions = pgTable("subscriptions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text().notNull(),
	customerId: text().notNull(),
	subscriptionId: text().notNull(),
	productId: text().notNull(),
	status: text().notNull(),
	currentPeriodStart: timestamp({ mode: 'string' }),
	currentPeriodEnd: timestamp({ mode: 'string' }),
	canceledAt: timestamp({ mode: 'string' }),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("subscriptions_customerId_idx").using("btree", table.customerId.asc().nullsLast().op("text_ops")),
	index("subscriptions_userId_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "subscriptions_userId_users_id_fk"
		}).onDelete("cascade"),
	unique("subscriptions_subscriptionId_unique").on(table.subscriptionId),
]);

export const uploads = pgTable("uploads", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text().notNull(),
	fileKey: text().notNull(),
	url: text().notNull(),
	fileName: text().notNull(),
	fileSize: integer().notNull(),
	contentType: text().notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("uploads_fileKey_idx").using("btree", table.fileKey.asc().nullsLast().op("text_ops")),
	index("uploads_userId_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "uploads_userId_users_id_fk"
		}).onDelete("cascade"),
]);

export const users = pgTable("users", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	email: text().notNull(),
	emailVerified: boolean().notNull(),
	image: text(),
	role: userRole().default('user').notNull(),
	paymentProviderCustomerId: text(),
	createdAt: timestamp({ mode: 'string' }).notNull(),
	updatedAt: timestamp({ mode: 'string' }).notNull(),
	bifrostApiKey: text(),
}, (table) => [
	unique("users_email_unique").on(table.email),
	unique("users_paymentProviderCustomerId_unique").on(table.paymentProviderCustomerId),
]);

export const verifications = pgTable("verifications", {
	id: text().primaryKey().notNull(),
	identifier: text().notNull(),
	value: text().notNull(),
	expiresAt: timestamp({ mode: 'string' }).notNull(),
	createdAt: timestamp({ mode: 'string' }),
	updatedAt: timestamp({ mode: 'string' }),
});

export const webhookEvents = pgTable("webhook_events", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	eventId: text().notNull(),
	eventType: text().notNull(),
	provider: text().default('creem').notNull(),
	processed: boolean().default(true).notNull(),
	processedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	payload: text(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("webhook_events_eventId_idx").using("btree", table.eventId.asc().nullsLast().op("text_ops")),
	index("webhook_events_provider_idx").using("btree", table.provider.asc().nullsLast().op("text_ops")),
	unique("webhook_events_eventId_unique").on(table.eventId),
]);

export const mcpConfigs = pgTable("mcp_configs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text().notNull(),
	agentType: text().notNull(),
	config: text().notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("mcp_configs_unique_idx").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.agentType.asc().nullsLast().op("text_ops")),
	index("mcp_configs_userId_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "mcp_configs_userId_users_id_fk"
		}).onDelete("cascade"),
]);
