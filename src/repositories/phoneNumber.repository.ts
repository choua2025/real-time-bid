import { PhoneNumber, PhoneType, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export interface CreatePhoneNumberInput {
  msisdn: string;
  type: PhoneType;
  category: string;
}

export interface ListPhoneNumbersFilter {
  category?: string;
  type?: PhoneType;
  skip?: number;
  take?: number;
}

export const phoneNumberRepository = {
  create(data: CreatePhoneNumberInput): Promise<PhoneNumber> {
    return prisma.phoneNumber.create({ data });
  },

  findById(id: string): Promise<PhoneNumber | null> {
    return prisma.phoneNumber.findUnique({ where: { id } });
  },

  findByMsisdn(msisdn: string): Promise<PhoneNumber | null> {
    return prisma.phoneNumber.findUnique({ where: { msisdn } });
  },

  list(filter: ListPhoneNumbersFilter = {}): Promise<PhoneNumber[]> {
    const { category, type, skip, take } = filter;
    return prisma.phoneNumber.findMany({
      where: { category, type },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    });
  },

  update(id: string, data: Prisma.PhoneNumberUpdateInput): Promise<PhoneNumber> {
    return prisma.phoneNumber.update({ where: { id }, data });
  },

  delete(id: string): Promise<PhoneNumber> {
    return prisma.phoneNumber.delete({ where: { id } });
  },
};
