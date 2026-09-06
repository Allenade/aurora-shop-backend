"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentAuditAction = exports.AccessAuditAction = exports.AuditLogType = void 0;
var AuditLogType;
(function (AuditLogType) {
    AuditLogType["ACCESS"] = "access";
    AuditLogType["MUTATION"] = "mutation";
    AuditLogType["PAYMENT"] = "payment";
})(AuditLogType || (exports.AuditLogType = AuditLogType = {}));
var AccessAuditAction;
(function (AccessAuditAction) {
    AccessAuditAction["LOGIN"] = "LOGIN";
    AccessAuditAction["LOGIN_DENIED"] = "LOGIN_DENIED";
    AccessAuditAction["LOGOUT"] = "LOGOUT";
    AccessAuditAction["REFRESH"] = "REFRESH";
    AccessAuditAction["OTP_REQUEST"] = "OTP_REQUEST";
    AccessAuditAction["ACCESS_DENIED"] = "ACCESS_DENIED";
    AccessAuditAction["PASSWORD_CHANGE"] = "PASSWORD_CHANGE";
})(AccessAuditAction || (exports.AccessAuditAction = AccessAuditAction = {}));
var PaymentAuditAction;
(function (PaymentAuditAction) {
    PaymentAuditAction["CREATED"] = "PAYMENT_CREATED";
    PaymentAuditAction["SUCCESS"] = "PAYMENT_SUCCESS";
    PaymentAuditAction["FAILED"] = "PAYMENT_FAILED";
    PaymentAuditAction["REFUNDED"] = "PAYMENT_REFUNDED";
    PaymentAuditAction["CANCELLED"] = "PAYMENT_CANCELLED";
})(PaymentAuditAction || (exports.PaymentAuditAction = PaymentAuditAction = {}));
//# sourceMappingURL=audit-log.types.js.map