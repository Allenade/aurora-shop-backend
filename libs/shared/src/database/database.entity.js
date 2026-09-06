"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseEntityDto = exports.DatabaseEntity = void 0;
exports.WithTimestamps = WithTimestamps;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const typeorm_1 = require("typeorm");
class DatabaseEntity {
    id;
    createdAt;
    updatedAt;
    deletedAt;
}
exports.DatabaseEntity = DatabaseEntity;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], DatabaseEntity.prototype, "id", void 0);
function WithTimestamps() {
    return (target) => {
        const proto = target.prototype;
        (0, typeorm_1.CreateDateColumn)({ name: 'created_at' })(proto, 'createdAt');
        (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at' })(proto, 'updatedAt');
        (0, typeorm_1.DeleteDateColumn)({ name: 'deleted_at', nullable: true, default: null })(proto, 'deletedAt');
    };
}
class DatabaseEntityDto {
    id;
    createdAt;
    updatedAt;
    deletedAt;
}
exports.DatabaseEntityDto = DatabaseEntityDto;
__decorate([
    (0, class_validator_1.IsUUID)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], DatabaseEntityDto.prototype, "id", void 0);
__decorate([
    (0, class_validator_1.IsDate)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Date)
], DatabaseEntityDto.prototype, "createdAt", void 0);
__decorate([
    (0, class_validator_1.IsDate)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Date)
], DatabaseEntityDto.prototype, "updatedAt", void 0);
__decorate([
    (0, class_validator_1.IsDate)(),
    (0, class_validator_1.IsOptional)(),
    (0, swagger_1.ApiPropertyOptional)(),
    __metadata("design:type", Date)
], DatabaseEntityDto.prototype, "deletedAt", void 0);
//# sourceMappingURL=database.entity.js.map