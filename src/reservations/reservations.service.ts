import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Reservation,
  ReservationDocument,
  ReservationStatus,
} from './schemas/reservation.schema';
import { ReservationRowDto } from './dto/reservation-row.dto';

@Injectable()
export class ReservationsService {
  private readonly logger = new Logger(ReservationsService.name);

  constructor(
    @InjectModel(Reservation.name)
    private reservationModel: Model<ReservationDocument>,
  ) {}

  async findByReservationId(
    reservationId: string,
  ): Promise<ReservationDocument | null> {
    return this.reservationModel.findOne({ reservationId }).exec();
  }

  async upsert(dto: ReservationRowDto): Promise<ReservationDocument> {
    const { reservationId, guestName, status, checkInDate, checkOutDate } = dto;

    return this.reservationModel
      .findOneAndUpdate(
        { reservationId },
        {
          guestName,
          status,
          checkInDate: new Date(checkInDate),
          checkOutDate: new Date(checkOutDate),
        },
        { upsert: true, new: true },
      )
      .exec();
  }

  async updateStatus(
    reservationId: string,
    status: ReservationStatus,
  ): Promise<ReservationDocument | null> {
    return this.reservationModel
      .findOneAndUpdate({ reservationId }, { status }, { new: true })
      .exec();
  }

  /**
   * Process a reservation according to business rules:
   * - If status is cancelled/completed: update only if exists, don't create
   * - Otherwise: upsert (create or update)
   *
   * @returns true if reservation was processed, false if skipped
   */
  async processReservation(dto: ReservationRowDto): Promise<boolean> {
    const isCancelledOrCompleted =
      dto.status === ReservationStatus.CANCELLED ||
      dto.status === ReservationStatus.COMPLETED;

    if (isCancelledOrCompleted) {
      const existing = await this.findByReservationId(dto.reservationId);

      if (existing) {
        await this.updateStatus(dto.reservationId, dto.status);
        this.logger.log(
          `Updated reservation ${dto.reservationId} status to ${dto.status}`,
        );
        return true;
      } else {
        this.logger.log(
          `Skipped reservation ${dto.reservationId} - status ${dto.status} but not in DB`,
        );
        return false;
      }
    }

    await this.upsert(dto);
    this.logger.log(`Upserted reservation ${dto.reservationId}`);
    return true;
  }
}
