import { PhoneType, Prisma } from "@prisma/client";
import {
  phoneNumberRepository,
  ListPhoneNumbersFilter,
} from "../repositories/phoneNumber.repository.js";
import { conflict, notFound } from "../lib/httpError.js";

export const phoneNumberService = {
  async create(input: { msisdn: string; type: PhoneType; category: string }) {
    if (await phoneNumberRepository.findByMsisdn(input.msisdn)) {
      throw conflict("A phone number with this MSISDN already exists.");
    }
    return phoneNumberRepository.create(input);
  },

  list(filter: ListPhoneNumbersFilter) {
    return phoneNumberRepository.list(filter);
  },

  async get(id: string) {
    const phone = await phoneNumberRepository.findById(id);
    if (!phone) throw notFound("Phone number not found.");
    return phone;
  },

  async update(
    id: string,
    data: { msisdn?: string; type?: PhoneType; category?: string },
  ) {
    await this.get(id); // 404 if missing
    if (data.msisdn) {
      const clash = await phoneNumberRepository.findByMsisdn(data.msisdn);
      if (clash && clash.id !== id) {
        throw conflict("A phone number with this MSISDN already exists.");
      }
    }
    return phoneNumberRepository.update(id, data);
  },

  async remove(id: string) {
    await this.get(id); // 404 if missing
    try {
      await phoneNumberRepository.delete(id);
    } catch (err) {
      // FK restrict: the number is referenced by one or more auctions.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
        throw conflict("Cannot delete a phone number that has auctions.");
      }
      throw err;
    }
  },
};
