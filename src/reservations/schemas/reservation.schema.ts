import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ReservationDocument = HydratedDocument<Reservation>;

export enum ReservationStatus {
  PENDING = 'oczekująca',
  COMPLETED = 'zrealizowana',
  CANCELLED = 'anulowana',
}

@Schema({ timestamps: true })
export class Reservation {
  @Prop({ required: true, unique: true })
  reservationId: string;

  @Prop({ required: true })
  guestName: string;

  @Prop({ required: true, enum: ReservationStatus })
  status: ReservationStatus;

  @Prop({ required: true })
  checkInDate: Date;

  @Prop({ required: true })
  checkOutDate: Date;
}

export const ReservationSchema = SchemaFactory.createForClass(Reservation);
