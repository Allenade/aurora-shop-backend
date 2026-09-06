import { Inject } from '@nestjs/common';
import {
  DataSource,
  DeepPartial,
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  ObjectLiteral,
  Repository,
} from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';

export abstract class BaseRepository<T extends ObjectLiteral> {
  private _repository?: Repository<T>;

  @Inject(DataSource)
  protected datasource: DataSource;

  constructor(protected readonly entityClass: new () => T) {}

  get repository(): Repository<T> {
    if (!this.datasource) {
      throw new Error(
        `DataSource not initialized for repository ${this.entityClass.name}.`,
      );
    }
    if (!this._repository) {
      this._repository = this.datasource.getRepository(this.entityClass);
    }
    return this._repository;
  }

  create(data: DeepPartial<T>): Promise<T> {
    return this.repository.save(this.repository.create(data));
  }

  save(entity: T): Promise<T> {
    return this.repository.save(entity);
  }

  find(options?: FindManyOptions<T>): Promise<T[]> {
    return this.repository.find(options);
  }

  findOne(options: FindOneOptions<T>): Promise<T | null> {
    return this.repository.findOne(options);
  }

  findById(id: string): Promise<T | null> {
    return this.repository.findOne({
      where: { id } as unknown as FindOptionsWhere<T>,
    });
  }

  async updateWhere(
    where: FindOptionsWhere<T>,
    data: QueryDeepPartialEntity<T>,
  ) {
    return this.repository.update(where, data);
  }

  async softDelete(id: string) {
    return this.repository.softDelete(id);
  }
}
