import { Prisma, Role, User } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export interface CreateUserInput {
  email: string;
  password: string; // already bcrypt-hashed by the service layer
  name: string;
  role?: Role;
}

export const userRepository = {
  create(data: CreateUserInput): Promise<User> {
    return prisma.user.create({ data });
  },

  findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  },

  findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { email } });
  },

  update(id: string, data: Prisma.UserUpdateInput): Promise<User> {
    return prisma.user.update({ where: { id }, data });
  },
};
