"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserStatus = exports.UserType = void 0;
var UserType;
(function (UserType) {
    UserType["BUYER"] = "buyer";
    UserType["PROCUREMENT"] = "procurement";
    UserType["ADMIN"] = "admin";
    UserType["VENDOR"] = "vendor";
})(UserType || (exports.UserType = UserType = {}));
var UserStatus;
(function (UserStatus) {
    UserStatus["ACTIVE"] = "active";
    UserStatus["SUSPENDED"] = "suspended";
})(UserStatus || (exports.UserStatus = UserStatus = {}));
//# sourceMappingURL=user.enums.js.map