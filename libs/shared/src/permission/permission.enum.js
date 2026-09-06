"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Resource = exports.Action = void 0;
var Action;
(function (Action) {
    Action["READ"] = "read";
    Action["LIST"] = "list";
    Action["CREATE"] = "create";
    Action["UPDATE"] = "update";
    Action["DELETE"] = "delete";
    Action["MANAGE"] = "manage";
})(Action || (exports.Action = Action = {}));
var Resource;
(function (Resource) {
    Resource["ALL"] = "all";
    Resource["DASHBOARD"] = "dashboard";
    Resource["OVERVIEW"] = "overview";
    Resource["SHOP"] = "shop";
    Resource["PRODUCT"] = "product";
    Resource["INVENTORY"] = "inventory";
    Resource["ORDER"] = "order";
    Resource["TRACK_ORDER"] = "track_order";
    Resource["PROCUREMENT"] = "procurement";
    Resource["QUOTE"] = "quote";
    Resource["SETTINGS"] = "settings";
    Resource["USER"] = "user";
    Resource["TRANSACTION"] = "transaction";
    Resource["PAYMENT_GATEWAY"] = "payment_gateway";
})(Resource || (exports.Resource = Resource = {}));
//# sourceMappingURL=permission.enum.js.map