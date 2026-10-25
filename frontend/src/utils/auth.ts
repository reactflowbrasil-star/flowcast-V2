 // Authentication utilities

 import { UserRole } from '@/types';

 export function canAccessAdminRoutes(userRole: UserRole): boolean {
   return userRole === UserRole.ADMIN;
 }

 export function canAccessResellerRoutes(userRole: UserRole): boolean {
   return userRole === UserRole.ADMIN || userRole === UserRole.RESELLER;
 }

 export function canManageUsers(userRole: UserRole): boolean {
   return userRole === UserRole.ADMIN || userRole === UserRole.RESELLER;
 }

 export function canManageContent(userRole: UserRole): boolean {
   return userRole === UserRole.ADMIN || userRole === UserRole.RESELLER;
 }

 export function canViewAnalytics(userRole: UserRole): boolean {
   return userRole === UserRole.ADMIN || userRole === UserRole.RESELLER;
 }

 export function getDefaultRoute(userRole: UserRole): string {
   switch (userRole) {
     case UserRole.ADMIN:
       return '/admin';
     case UserRole.RESELLER:
       return '/reseller';
     case UserRole.END_USER:
       return '/user';
     default:
       return '/';
   }
 }

 export function getRoleDisplayName(role: UserRole): string {
   switch (role) {
     case UserRole.ADMIN:
       return 'Administrator';
     case UserRole.RESELLER:
       return 'Reseller';
     case UserRole.END_USER:
       return 'End User';
     default:
       return 'Unknown';
   }
 }

 /**
  * Normalize role strings coming from different sources (backend tokens, stored user objects).
  *
  * Accepts values such as:
  *  - "admin", "Admin"
  *  - "reseller", "Reseller"
  *  - "end_user", "EndUser", "end-user", "enduser", "End_User"
  *
  * Returns a value from UserRole enum. Defaults to UserRole.END_USER when unknown.
  */
 export function normalizeRole(role: string | UserRole | undefined): UserRole {
   const raw = String(role ?? '').trim().toLowerCase();
   // Normalize separators and casing
   const normalized = raw.replace(/[-\s]/g, '_');

   if (normalized === 'admin') return UserRole.ADMIN;
   if (normalized === 'reseller') return UserRole.RESELLER;
   if (normalized === 'end_user' || normalized === 'enduser') return UserRole.END_USER;

   // Fallback: try to map common synonyms
   if (normalized.includes('admin')) return UserRole.ADMIN;
   if (normalized.includes('resell')) return UserRole.RESELLER;
   if (normalized.includes('user')) return UserRole.END_USER;

   // Safe default
   return UserRole.END_USER;
 }

 export function isTokenExpired(token: string): boolean {
   try {
     const payload = JSON.parse(atob(token.split('.')[1]));
     const currentTime = Date.now() / 1000;
     return payload.exp < currentTime;
   } catch {
     return true;
   }
 }
