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
exports.BaseRepository = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("typeorm");
class BaseRepository {
    entityClass;
    _repository;
    datasource;
    constructor(entityClass) {
        this.entityClass = entityClass;
    }
    get repository() {
        if (!this.datasource) {
            throw new Error(`DataSource not initialized for repository ${this.entityClass.name}.`);
        }
        if (!this._repository) {
            this._repository = this.datasource.getRepository(this.entityClass);
        }
        return this._repository;
    }
    create(data) {
        return this.repository.save(this.repository.create(data));
    }
    save(entity) {
        return this.repository.save(entity);
    }
    find(options) {
        return this.repository.find(options);
    }
    findOne(options) {
        return this.repository.findOne(options);
    }
    findById(id) {
        return this.repository.findOne({
            where: { id },
        });
    }
    async updateWhere(where, data) {
        return this.repository.update(where, data);
    }
    async softDelete(id) {
        return this.repository.softDelete(id);
    }
}
exports.BaseRepository = BaseRepository;
__decorate([
    (0, common_1.Inject)(typeorm_1.DataSource),
    __metadata("design:type", typeorm_1.DataSource)
], BaseRepository.prototype, "datasource", void 0);
//# sourceMappingURL=base.repository.js.map