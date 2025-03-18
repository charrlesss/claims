import { PrismaClient } from "@prisma/client";
import express, { NextFunction, Request, Response } from "express";
import { compareSync } from "bcrypt";
import jwt from "jsonwebtoken";
import { _Request, _Response } from "../types/express";

const Authentication = express.Router();
const prisma = new PrismaClient();

function generateAccessToken(UserId: string) {
  return jwt.sign({ UserId }, process.env.ACCESS_TOKEN as string, {
    expiresIn: "30m",
  });
}

async function updateRefreshToken(UserId: string, refreshToken: string) {
  await prisma.users.update({
    where: {
      UserId: UserId,
    },
    data: {
      REFRESH_TOKEN: refreshToken,
    },
  });
}

export function ValidateToken(
  req: _Request,
  res: _Response,
  next: NextFunction
): any {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (token === "" || token == null) {
    return res.sendStatus(401);
  }

  jwt.verify(
    token as string,
    process.env.ACCESS_TOKEN as string,
    (err, user) => {
      if (err) {
        return res.sendStatus(403);
      }
      req.user = user;
      next();
    }
  );
}

Authentication.post("/refresh-token", async (req, res): Promise<any> => {
  const refreshToken = req.body.REFRESH_TOKEN;
  if (refreshToken == null) return res.sendStatus(401);

  if (
    !(await prisma.users.findFirst({
      where: { REFRESH_TOKEN: { equals: refreshToken } },
    }))
  ) {
    return res.sendStatus(403);
  }

  jwt.verify(
    refreshToken as string,
    process.env.REFRESH_TOKEN as string,
    (err, user) => {
      if (err) return res.sendStatus(403);
      const getUser: any = user;
      const accessToken = generateAccessToken(getUser.UserId);
      res.cookie("up-at-login", accessToken, { httpOnly: true });

      res.send({ accessToken: accessToken , refreshToken});
    }
  );
});

Authentication.post(
  "/login",
  async (req: _Request, res: _Response): Promise<any> => {
    const findUser = await prisma.users.findUnique({
      where: {
        Username: req.body.username,
      },
    });

    if (!findUser || findUser == null) {
      return res.send({
        message: "No Username Found!",
        success: false,
        username: true,
        password: false,
        user: null,
      });
    }

    if (compareSync(req.body.password, findUser.Password)) {
      const accessToken = generateAccessToken(findUser.UserId);
      const refreshToken = jwt.sign(
        { UserId: findUser.UserId },
        process.env.REFRESH_TOKEN as string
      );
      updateRefreshToken(findUser.UserId, refreshToken);

      res.cookie("up-rt-login", refreshToken, { httpOnly: true });

      await prisma.system_logs.create({
        data: {
          action: "login",
          username: req.body.username,
          dataString: findUser.UserId,
          createdAt: new Date(),
          user_id: findUser.UserId,
          module: "Authentication",
          account_type: findUser?.AccountType as string,
        },
      });

      return res.send({
        message: "Successfully Login",
        success: true,
        username: false,
        password: false,
        user: {
          accessToken,
          refreshToken,
        },
      });
    } else {
      return res.send({
        message: "Password Incorrect",
        success: false,
        username: false,
        password: true,
        user: null,
      });
    }
  }
);

Authentication.get(
  "/token",
  async (req: _Request, res: _Response): Promise<any> => {
    const refreshToken = req.cookies["up-rt-login"];

    if (refreshToken === "" || refreshToken == null) {
      return res.send(null);
    }
    try {
      res.send({
        refreshToken,
      });
    } catch (err: any) {
      console.log(err.message);
      return res.send(null);
    }
  }
);

export async function VerifyToken(token: string, secret: string) {
  return new Promise(function (resolve, reject) {
    jwt.verify(token, secret, function (err, decode) {
      if (err) {
        reject(err);
        return;
      }
      resolve(decode);
    });
  });
}

Authentication.get("/logout", (req: _Request, res: _Response) => {
  res.cookie("up-rt-login", { expires: Date.now() });
  res.cookie("up-at-login", { expires: Date.now() });
  res.clearCookie("up-rt-login");
  res.clearCookie("up-at-login");
  const id = (req.user as any).UserId;
  updateRefreshToken(id, "");
  res.send({ message: "Logout Successfully", success: true });
});

export function logout(req: _Request, res: _Response) {
  res.cookie("up-rt-login", { expires: Date.now() });
  res.cookie("up-at-login", { expires: Date.now() });
  res.cookie("db-k-d", { expires: Date.now() });
  res.clearCookie("up-rt-login");
  res.clearCookie("up-at-login");
  res.clearCookie("db-k-d");
  res.clearCookie("up-ima-login");
  const id = (req.user as any).UserId;
  updateRefreshToken(id, "");
  res.send({ message: "Logout Successfully", success: true });
}

export default Authentication;
