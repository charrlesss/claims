import express from "express";
import { PrismaClient } from "@prisma/client";
import { saveUserLogs, saveUserLogsCode } from "./Claims";

const prisma = new PrismaClient();
const Imbersement = express.Router();

Imbersement.post("/get-imbersement-id", async (req, res): Promise<any> => {
  try {
    const currentMonth: any = await prisma.$queryRawUnsafe(`
        SELECT DATE_FORMAT(NOW(), '%y%m') AS current_month
      `);
    const monthPrefix = currentMonth[0].current_month; // e.g., "2503"

    // Get the last claim_id for the current month
    const lastClaim: any = await prisma.$queryRawUnsafe(`
        SELECT refNo FROM claims.imbursement 
        WHERE refNo LIKE '${monthPrefix}%' COLLATE utf8mb4_unicode_ci 
        ORDER BY refNo DESC 
        LIMIT 1
      `);

    let newCounter = "001"; // Default if no existing claim_id

    if (lastClaim.length > 0 && lastClaim[0].refNo) {
      const lastCounter = parseInt(lastClaim[0].refNo.split("-")[1], 10);
      newCounter = String(lastCounter + 1).padStart(3, "0"); // Increment and format
    }

    const refNo = `${monthPrefix}-${newCounter}`;

    console.log("Generated Imbersement ID:", refNo);

    res.send({
      refNo,
      message: "Successfully Generate Claim ID.",
      success: true,
    });
  } catch (error: any) {
    console.log(error.message);
    res.send({
      refNo: "",
      message: `We're experiencing a server issue. Please try again in a few minutes. If the issue continues, report it to IT with the details of what you were doing at the time.`,
      success: false,
    });
  }
});
Imbersement.post("/search-imbersement", async (req, res): Promise<any> => {
  try {
    res.send({
      message: "Successfully Add Imbersement.",
      success: true,
      data: await searchImberment(req.body.search),
    });
  } catch (error: any) {
    console.log(error.message);
    res.send({
      data: [],
      message: `We're experiencing a server issue. Please try again in a few minutes. If the issue continues, report it to IT with the details of what you were doing at the time.`,
      success: false,
    });
  }
});
Imbersement.post("/add-imbersement", async (req, res): Promise<any> => {
  try {
    delete req.body.isUpdate;
    req.body.amount_claim = parseFloat(
      req.body.amount_claim.replace(/,/g, "")
    ).toFixed(2);
    req.body.amount_imbursement = parseFloat(
      req.body.amount_imbursement.replace(/,/g, "")
    ).toFixed(2);

    req.body.date_claim = new Date(req.body.date_claim);
    req.body.date_release = new Date(req.body.date_release);
    req.body.date_return_upward = new Date(req.body.date_return_upward);
    await prisma.imbursement.create({ data: req.body });
    await saveUserLogs(req, req.body.refNo, "add", "Imbersement");
    res.send({
      message: "Successfully Add Imbersement.",
      success: true,
      data: await searchImberment(""),
    });
  } catch (error: any) {
    console.log(error.message);
    res.send({
      message: `We're experiencing a server issue. Please try again in a few minutes. If the issue continues, report it to IT with the details of what you were doing at the time.`,
      success: false,
      data: [],
    });
  }
});
Imbersement.post("/update-imbersement", async (req, res): Promise<any> => {
  try {
    if (
      !(await saveUserLogsCode(req, "update", req.body.refNo, "Imbersement"))
    ) {
      return res.send({ message: "Invalid User Code", success: false });
    }
    delete req.body.userCodeConfirmation;

    await prisma.$queryRawUnsafe(
      `DELETE FROM claims.imbursement WHERE refNo = ?`,
      req.body.refNo
    );

    req.body.amount_claim = parseFloat(
      req.body.amount_claim.replace(/,/g, "")
    ).toFixed(2);
    req.body.amount_imbursement = parseFloat(
      req.body.amount_imbursement.replace(/,/g, "")
    ).toFixed(2);

    req.body.date_claim = new Date(req.body.date_claim);
    req.body.date_release = new Date(req.body.date_release);
    req.body.date_return_upward = new Date(req.body.date_return_upward);
    await prisma.imbursement.create({ data: req.body });
    res.send({
      message: "Successfully Update Imbersement.",
      success: true,
      data: await searchImberment(""),
    });
  } catch (error: any) {
    console.log(error.message);
    res.send({
      message: `We're experiencing a server issue. Please try again in a few minutes. If the issue continues, report it to IT with the details of what you were doing at the time.`,
      success: false,
      data: [],
    });
  }
});
Imbersement.post("/delete-imbersement", async (req, res): Promise<any> => {
  try {
    if (
      !(await saveUserLogsCode(req, "update", req.body.refNo, "Imbersement"))
    ) {
      return res.send({ message: "Invalid User Code", success: false });
    }
    delete req.body.userCodeConfirmation;

    await prisma.$queryRawUnsafe(
      `DELETE FROM claims.imbursement WHERE refNo = ?`,
      req.body.refNo
    );
    await saveUserLogs(req, req.body.refNo, "delete", "Imbersement");

    res.send({
      message: "Successfully Delete Imbersement.",
      success: true,
      data: await searchImberment(""),
    });
  } catch (error: any) {
    console.log(error.message);
    res.send({
      message: `We're experiencing a server issue. Please try again in a few minutes. If the issue continues, report it to IT with the details of what you were doing at the time.`,
      success: false,
      data: [],
    });
  }
});
async function searchImberment(search: string) {
  const data = await prisma.$queryRawUnsafe(
    `
    SELECT 
      refNo,
      check_from,
      client_name,
      type_claim,
      format(amount_claim,2) as amount_claim,
      date_claim,
      DATE_FORMAT(date_claim, '%m/%d/%Y') AS date_claim,
      payment,
      format(amount_imbursement,2) as amount_imbursement,
      DATE_FORMAT(date_release, '%m/%d/%Y') AS date_release,
      payee,
      DATE_FORMAT(date_return_upward, '%m/%d/%Y') AS date_return_upward,
      DATE_FORMAT(date_claim, '%Y-%m-%d') as date_claim_sub,
      DATE_FORMAT(date_claim, '%Y-%m-%d') as  date_release_sub,
      DATE_FORMAT(date_claim, '%Y-%m-%d') as date_return_upward_sub
    FROM
        claims.imbursement
    WHERE
        refNo LIKE ?  
        OR client_name LIKE ?  
        OR payee LIKE ?  
        OR type_claim LIKE ?
    ORDER BY refNo;
  `,
    `%${search}%`,
    `%${search}%`,
    `%${search}%`,
    `%${search}%`
  );

  return data;
}
export default Imbersement;
