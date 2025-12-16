import { relations } from "drizzle-orm/relations";
import { users, payments, accounts, sessions, subscriptions, uploads, mcpConfigs } from "./schema";

export const paymentsRelations = relations(payments, ({one}) => ({
	user: one(users, {
		fields: [payments.userId],
		references: [users.id]
	}),
}));

export const usersRelations = relations(users, ({many}) => ({
	payments: many(payments),
	accounts: many(accounts),
	sessions: many(sessions),
	subscriptions: many(subscriptions),
	uploads: many(uploads),
	mcpConfigs: many(mcpConfigs),
}));

export const accountsRelations = relations(accounts, ({one}) => ({
	user: one(users, {
		fields: [accounts.userId],
		references: [users.id]
	}),
}));

export const sessionsRelations = relations(sessions, ({one}) => ({
	user: one(users, {
		fields: [sessions.userId],
		references: [users.id]
	}),
}));

export const subscriptionsRelations = relations(subscriptions, ({one}) => ({
	user: one(users, {
		fields: [subscriptions.userId],
		references: [users.id]
	}),
}));

export const uploadsRelations = relations(uploads, ({one}) => ({
	user: one(users, {
		fields: [uploads.userId],
		references: [users.id]
	}),
}));

export const mcpConfigsRelations = relations(mcpConfigs, ({one}) => ({
	user: one(users, {
		fields: [mcpConfigs.userId],
		references: [users.id]
	}),
}));
