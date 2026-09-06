import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDate, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import {
  CreateDateColumn,
  DeleteDateColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

abstract class DatabaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

function WithTimestamps(): ClassDecorator {
  return (target: Function) => {
    const proto = target.prototype as Record<string, unknown>;
    CreateDateColumn({ name: 'created_at' })(proto, 'createdAt');
    UpdateDateColumn({ name: 'updated_at' })(proto, 'updatedAt');
    DeleteDateColumn({ name: 'deleted_at', nullable: true, default: null })(
      proto,
      'deletedAt',
    );
  };
}

abstract class DatabaseEntityDto implements DatabaseEntity {
  @IsUUID()
  @IsNotEmpty()
  @ApiProperty()
  id: string;

  @IsDate()
  @IsNotEmpty()
  @ApiProperty()
  createdAt: Date;

  @IsDate()
  @IsNotEmpty()
  @ApiProperty()
  updatedAt: Date;

  @IsDate()
  @IsOptional()
  @ApiPropertyOptional()
  deletedAt?: Date;
}

export { DatabaseEntity, DatabaseEntityDto, WithTimestamps };
