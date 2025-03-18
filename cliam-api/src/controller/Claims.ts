import express from "express";
import { PrismaClient } from "@prisma/client";
import multer from "multer";
const prisma = new PrismaClient();
const Claims = express.Router();
import path from "path";
import fs from "fs-extra";
import { v4 as uuidV4 } from "uuid";
const uploadDir = path.join(__dirname, "./../../static/claim-files");
import { compareSync } from "bcrypt";
import { json } from "stream/consumers";

fs.ensureDirSync(uploadDir);
Claims.post("/get-claim-id", async (req, res): Promise<any> => {
  try {
    const currentMonth: any = await prisma.$queryRawUnsafe(`
      SELECT DATE_FORMAT(NOW(), '%y%m') AS current_month
    `);
    const monthPrefix = currentMonth[0].current_month; // e.g., "2503"

    // Get the last claim_id for the current month
    const lastClaim: any = await prisma.$queryRawUnsafe(`
      SELECT claim_id FROM claims.claims 
      WHERE claim_id LIKE '${monthPrefix}%' COLLATE utf8mb4_unicode_ci 
      ORDER BY claim_id DESC 
      LIMIT 1
    `);

    let newCounter = "001"; // Default if no existing claim_id

    if (lastClaim.length > 0 && lastClaim[0].claim_id) {
      const lastCounter = parseInt(lastClaim[0].claim_id.split("-")[1], 10);
      newCounter = String(lastCounter + 1).padStart(3, "0"); // Increment and format
    }

    const claimID = `${monthPrefix}-${newCounter}`;

    console.log("Generated Claim ID:", claimID);

    res.send({
      claimID,
      message: "Successfully Generate Claim ID.",
      success: true,
    });
  } catch (error: any) {
    console.log(error.message);
    res.send({
      claimID: "",
      message: `We're experiencing a server issue. Please try again in a few minutes. If the issue continues, report it to IT with the details of what you were doing at the time.`,
      success: false,
    });
  }
});
Claims.post("/get-reference-id", async (req, res): Promise<any> => {
  try {
    const reference = await generateUniqueClaimID();
    res.send({
      reference,
      message: "Successfully Generate Claim ID.",
      success: true,
    });
  } catch (error: any) {
    console.log(error.message);
    res.send({
      reference: "",
      message: `We're experiencing a server issue. Please try again in a few minutes. If the issue continues, report it to IT with the details of what you were doing at the time.`,
      success: false,
    });
  }
});
Claims.post("/selected-search-policy", async (req, res): Promise<any> => {
  try {
    const policyType = req.body.policyType.toUpperCase();
    let database = "";

    if (req.body.department === "UMIS") {
      database = "upward_insurance_umis";
    } else {
      database = "new_upward_insurance_ucsmi";
    }

    const totalGross = await prisma.$queryRawUnsafe(
      `SELECT TotalDue FROM ${database}.policy where PolicyNo = ?`,
      req.body.policyNo
    );
    const totalPaidDeposit = await prisma.$queryRawUnsafe(
      `SELECT  ifNull(SUM(Credit),0)  as totalDeposit FROM ${database}.journal where Source_Type = 'OR' and GL_Acct = '1.03.01' and ID_No = ?`,
      req.body.policyNo
    );
    const totalPaidReturned = await prisma.$queryRawUnsafe(
      `SELECT ifNull(SUM(Debit),0) as totalReturned FROM ${database}.journal where Source_Type = 'RC'   and GL_Acct = '1.03.01' and ID_No = ?`,
      req.body.policyNo
    );
    const totalDiscount = await prisma.$queryRawUnsafe(
      `SELECT ifNull(SUM(Debit),0)  as discount FROM upward_insurance_umis.journal where Source_Type = 'GL'  and GL_Acct = '7.10.15'   and ID_No = ?`,
      req.body.policyNo
    );

    if (policyType === "COM" || policyType === "TPL") {
      res.send({
        data: await prisma.$queryRawUnsafe(
          `
          SELECT 
              a.IDNo,
              a.PolicyType,
              a.PolicyNo,
              '${
                database === "upward_insurance_umis" ? "UMIS" : "UCSMI"
              }' AS Department,
              IF(b.company <> ''
                      AND b.company IS NOT NULL,
                  b.company,
                  CONCAT(IF(b.lastname <> ''
                                  AND b.lastname IS NOT NULL,
                              CONCAT(b.lastname, ', '),
                              ''),
                          b.firstname,
                          IF(b.suffix <> '' AND b.suffix IS NOT NULL,
                              CONCAT(', ', b.suffix),
                              ''))) AS Name,
              c.ChassisNo,
              c.MotorNo,
              c.CoverNo,
              c.ORNo,
              c.Model,
              c.Make,
              c.BodyType,
              c.PlateNo,
              a.Account
          FROM
              ${database}.policy a
                  LEFT JOIN
              ${database}.entry_client b ON a.IDNo = b.entry_client_id
                  LEFT JOIN
              ${database}.vpolicy c ON a.PolicyNo = c.PolicyNo
          WHERE
              a.PolicyNo = ?
          `,
          req.body.policyNo
        ),
        payment: {
          totalGross,
          totalPaidDeposit,
          totalPaidReturned,
          totalDiscount,
        },
        message: "Successfully Generate Claim ID.",
        success: true,
      });
    } else if (policyType === "FIRE") {
      res.send({
        data: await prisma.$queryRawUnsafe(
          `
          SELECT 
              a.IDNo,
              a.PolicyType,
              a.PolicyNo,
              '${
                database === "upward_insurance_umis" ? "UMIS" : "UCSMI"
              }' AS Department,
              IF(b.company <> ''
                      AND b.company IS NOT NULL,
                  b.company,
                  CONCAT(IF(b.lastname <> ''
                                  AND b.lastname IS NOT NULL,
                              CONCAT(b.lastname, ', '),
                              ''),
                          b.firstname,
                          IF(b.suffix <> '' AND b.suffix IS NOT NULL,
                              CONCAT(', ', b.suffix),
                              ''))) AS Name,
              c.*
          FROM
              ${database}.policy a
                  LEFT JOIN
              ${database}.entry_client b ON a.IDNo = b.entry_client_id
                  LEFT JOIN
              ${database}.fpolicy c ON a.PolicyNo = c.PolicyNo
          WHERE
              a.PolicyNo = ?
          `,
          req.body.policyNo
        ),
        payment: {
          totalGross,
          totalPaidDeposit,
          totalPaidReturned,
          totalDiscount,
        },
        message: "Successfully Generate Claim ID.",
        success: true,
      });
    } else if (policyType === "CGL") {
      res.send({
        data: await prisma.$queryRawUnsafe(
          `
          SELECT 
              a.IDNo,
              a.PolicyType,
              a.PolicyNo,
              '${
                database === "upward_insurance_umis" ? "UMIS" : "UCSMI"
              }' AS Department,
              IF(b.company <> ''
                      AND b.company IS NOT NULL,
                  b.company,
                  CONCAT(IF(b.lastname <> ''
                                  AND b.lastname IS NOT NULL,
                              CONCAT(b.lastname, ', '),
                              ''),
                          b.firstname,
                          IF(b.suffix <> '' AND b.suffix IS NOT NULL,
                              CONCAT(', ', b.suffix),
                              ''))) AS Name,
              c.*
          FROM
              ${database}.policy a
                  LEFT JOIN
              ${database}.entry_client b ON a.IDNo = b.entry_client_id
                  LEFT JOIN
              ${database}.cglpolicy c ON a.PolicyNo = c.PolicyNo
          WHERE
              a.PolicyNo = ?
          `,
          req.body.policyNo
        ),
        payment: {
          totalGross,
          totalPaidDeposit,
          totalPaidReturned,
          totalDiscount,
        },
        message: "Successfully Generate Claim ID.",
        success: true,
      });
    } else if (policyType === "MAR") {
      res.send({
        data: await prisma.$queryRawUnsafe(
          `
          SELECT 
              a.IDNo,
              a.PolicyType,
              a.PolicyNo,
              '${
                database === "upward_insurance_umis" ? "UMIS" : "UCSMI"
              }' AS Department,
              IF(b.company <> ''
                      AND b.company IS NOT NULL,
                  b.company,
                  CONCAT(IF(b.lastname <> ''
                                  AND b.lastname IS NOT NULL,
                              CONCAT(b.lastname, ', '),
                              ''),
                          b.firstname,
                          IF(b.suffix <> '' AND b.suffix IS NOT NULL,
                              CONCAT(', ', b.suffix),
                              ''))) AS Name,
              c.*
          FROM
              ${database}.policy a
                  LEFT JOIN
              ${database}.entry_client b ON a.IDNo = b.entry_client_id
                  LEFT JOIN
              ${database}.mpolicy c ON a.PolicyNo = c.PolicyNo
          WHERE
              a.PolicyNo = ?
          `,
          req.body.policyNo
        ),
        payment: {
          totalGross,
          totalPaidDeposit,
          totalPaidReturned,
          totalDiscount,
        },
        message: "Successfully Generate Claim ID.",
        success: true,
      });
    } else if (policyType === "MSPR") {
      res.send({
        data: await prisma.$queryRawUnsafe(
          `
          SELECT 
              a.IDNo,
              a.PolicyType,
              a.PolicyNo,
              '${
                database === "upward_insurance_umis" ? "UMIS" : "UCSMI"
              }' AS Department,
              IF(b.company <> ''
                      AND b.company IS NOT NULL,
                  b.company,
                  CONCAT(IF(b.lastname <> ''
                                  AND b.lastname IS NOT NULL,
                              CONCAT(b.lastname, ', '),
                              ''),
                          b.firstname,
                          IF(b.suffix <> '' AND b.suffix IS NOT NULL,
                              CONCAT(', ', b.suffix),
                              ''))) AS Name,
              c.*
          FROM
              ${database}.policy a
                  LEFT JOIN
              ${database}.entry_client b ON a.IDNo = b.entry_client_id
                  LEFT JOIN
              ${database}.msprpolicy c ON a.PolicyNo = c.PolicyNo
          WHERE
              a.PolicyNo = ?
          `,
          req.body.policyNo
        ),
        payment: {
          totalGross,
          totalPaidDeposit,
          totalPaidReturned,
          totalDiscount,
        },
        message: "Successfully Generate Claim ID.",
        success: true,
      });
    } else if (policyType === "PA") {
      res.send({
        data: await prisma.$queryRawUnsafe(
          `
          SELECT 
              a.IDNo,
              a.PolicyType,
              a.PolicyNo,
              '${
                database === "upward_insurance_umis" ? "UMIS" : "UCSMI"
              }' AS Department,
              IF(b.company <> ''
                      AND b.company IS NOT NULL,
                  b.company,
                  CONCAT(IF(b.lastname <> ''
                                  AND b.lastname IS NOT NULL,
                              CONCAT(b.lastname, ', '),
                              ''),
                          b.firstname,
                          IF(b.suffix <> '' AND b.suffix IS NOT NULL,
                              CONCAT(', ', b.suffix),
                              ''))) AS Name,
              c.*
          FROM
              ${database}.policy a
                  LEFT JOIN
              ${database}.entry_client b ON a.IDNo = b.entry_client_id
                  LEFT JOIN
              ${database}.papolicy c ON a.PolicyNo = c.PolicyNo
          WHERE
              a.PolicyNo = ?
          `,
          req.body.policyNo
        ),
        payment: {
          totalGross,
          totalPaidDeposit,
          totalPaidReturned,
          totalDiscount,
        },
        message: "Successfully Generate Claim ID.",
        success: true,
      });
    } else {
      res.send({
        data: await prisma.$queryRawUnsafe(
          `
          SELECT 
              a.IDNo,
              a.PolicyType,
              a.PolicyNo,
              '${
                database === "upward_insurance_umis" ? "UMIS" : "UCSMI"
              }' AS Department,
              IF(b.company <> ''
                      AND b.company IS NOT NULL,
                  b.company,
                  CONCAT(IF(b.lastname <> ''
                                  AND b.lastname IS NOT NULL,
                              CONCAT(b.lastname, ', '),
                              ''),
                          b.firstname,
                          IF(b.suffix <> '' AND b.suffix IS NOT NULL,
                              CONCAT(', ', b.suffix),
                              ''))) AS Name,
              c.*
          FROM
              ${database}.policy a
                  LEFT JOIN
              ${database}.entry_client b ON a.IDNo = b.entry_client_id
                  LEFT JOIN
              ${database}.bpolicy c ON a.PolicyNo = c.PolicyNo
          WHERE
              a.PolicyNo = ?
          `,
          req.body.policyNo
        ),
        payment: {
          totalGross,
          totalPaidDeposit,
          totalPaidReturned,
          totalDiscount,
        },
        message: "Successfully Generate Claim ID.",
        success: true,
      });
    }
  } catch (error: any) {
    console.log(error.message);
    res.send({
      data: "",
      message: `We're experiencing a server issue. Please try again in a few minutes. If the issue continues, report it to IT with the details of what you were doing at the time.`,
      success: false,
    });
  }
});
Claims.post("/search-claim", async (req, res): Promise<any> => {
  try {
    const qry = `
     SELECT 
        a.claim_id,
        b.IDNo,
        b.PolicyType,
        b.PolicyNo,
        b.Department,
        b.Name,
        b.ChassisNo,
        b.MotorNo
    FROM
        claims.claims a
            LEFT JOIN
        (SELECT 
            b.IDNo,
                b.PolicyType,
                b.PolicyNo,
                'UCSMI' AS Department,
                IF(c.company <> ''
                    AND c.company IS NOT NULL, c.company, CONCAT(IF(c.lastname <> ''
                    AND c.lastname IS NOT NULL, CONCAT(c.lastname, ', '), ''), c.firstname, IF(c.suffix <> '' AND c.suffix IS NOT NULL, CONCAT(', ', c.suffix), ''))) AS Name,
                d.ChassisNo,
                d.MotorNo
        FROM
            new_upward_insurance_ucsmi.policy b
        LEFT JOIN new_upward_insurance_ucsmi.entry_client c ON b.IDNo = c.entry_client_id
        LEFT JOIN new_upward_insurance_ucsmi.vpolicy d ON b.policyNo = d.PolicyNo 
        UNION ALL 
        SELECT 
            b.IDNo,
                b.PolicyType,
                b.PolicyNo,
                'UMIS' AS Department,
                IF(c.company <> ''
                    AND c.company IS NOT NULL, c.company, CONCAT(IF(c.lastname <> ''
                    AND c.lastname IS NOT NULL, CONCAT(c.lastname, ', '), ''), c.firstname, IF(c.suffix <> '' AND c.suffix IS NOT NULL, CONCAT(', ', c.suffix), ''))) AS Name,
                d.ChassisNo,
                d.MotorNo
        FROM
            upward_insurance_umis.policy b
        LEFT JOIN upward_insurance_umis.entry_client c ON b.IDNo = c.entry_client_id
        LEFT JOIN upward_insurance_umis.vpolicy d ON b.policyNo = d.PolicyNo) b ON a.policyNo = b.PolicyNo
    WHERE
        a.claim_id LIKE ?
            OR b.ChassisNo LIKE ?
            OR b.MotorNo LIKE ?
            OR b.PolicyNo LIKE ?
            OR b.IDNo LIKE ?
            OR b.Name LIKE ?
    ORDER BY claim_id
    LIMIT 100
      `;
    const data = await prisma.$queryRawUnsafe(
      qry,
      `%${req.body.search}%`,
      `%${req.body.search}%`,
      `%${req.body.search}%`,
      `%${req.body.search}%`,
      `%${req.body.search}%`,
      `%${req.body.search}%`
    );
    res.send({
      data,
      message: "Successfully Generate Claim ID.",
      success: true,
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
Claims.post("/search-policy", async (req, res): Promise<any> => {
  try {
    const qry = `
      SELECT 
          *
      FROM
          (SELECT 
              a.IDNo,
                  a.PolicyType,
                  a.PolicyNo,
                  'UCSMI' AS Department,
                  IF(b.company <> ''
                      AND b.company IS NOT NULL, b.company, CONCAT(IF(b.lastname <> ''
                      AND b.lastname IS NOT NULL, CONCAT(b.lastname, ', '), ''), b.firstname, IF(b.suffix <> '' AND b.suffix IS NOT NULL, CONCAT(', ', b.suffix), ''))) AS Name,
                  c.ChassisNo,
                  c.MotorNo
          FROM
              new_upward_insurance_ucsmi.policy a
          LEFT JOIN new_upward_insurance_ucsmi.entry_client b ON a.IDNo = b.entry_client_id
          LEFT JOIN new_upward_insurance_ucsmi.vpolicy c ON a.PolicyNo = c.PolicyNo UNION ALL SELECT 
              a.IDNo,
                  a.PolicyType,
                  a.PolicyNo,
                  'UMIS' AS Department,
                  IF(b.company <> ''
                      AND b.company IS NOT NULL, b.company, CONCAT(IF(b.lastname <> ''
                      AND b.lastname IS NOT NULL, CONCAT(b.lastname, ', '), ''), b.firstname, IF(b.suffix <> '' AND b.suffix IS NOT NULL, CONCAT(', ', b.suffix), ''))) AS Name,
                  c.ChassisNo,
                  c.MotorNo
          FROM
              upward_insurance_umis.policy a
          LEFT JOIN upward_insurance_umis.entry_client b ON a.IDNo = b.entry_client_id
          LEFT JOIN upward_insurance_umis.vpolicy c ON a.PolicyNo = c.PolicyNo) a
      WHERE
          a.ChassisNo LIKE ?
              OR a.MotorNo LIKE ?
              OR a.PolicyNo LIKE ?
              OR a.IDNo LIKE ?
              OR a.Name LIKE ?
      ORDER BY NAME
      LIMIT 100
      `;
    const data = await prisma.$queryRawUnsafe(
      qry,
      `%${req.body.search}%`,
      `%${req.body.search}%`,
      `%${req.body.search}%`,
      `%${req.body.search}%`,
      `%${req.body.search}%`
    );
    res.send({
      data,
      message: "Successfully Generate Claim ID.",
      success: true,
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
Claims.post("/selected-search-claim", async (req, res): Promise<any> => {
  try {
    const policyType = req.body.policyType.toUpperCase();
    let database = "";

    if (req.body.department === "UMIS") {
      database = "upward_insurance_umis";
    } else {
      database = "new_upward_insurance_ucsmi";
    }

    const claimDetails: any = await prisma.$queryRawUnsafe(
      `
      SELECT 
          a.claim_id,
          b.claim_reference_no AS reference,
          b.claim_type AS claim_type,
          DATE_FORMAT(b.date_report, '%m/%d/%Y') AS date_report,
          DATE_FORMAT(b.date_accident, '%m/%d/%Y') AS date_accident,
          b.status AS status,
          DATE_FORMAT(b.date_received, '%m/%d/%Y') AS date_receive,
          format(b.amount_claim, 2) AS amount_claim,
          format(b.amount_approved, 2) AS amount_approved,
          format(b.participation, 2) AS amount_participation,
          format(b.net_amount, 2) AS amount_net,
          b.name_ttpd AS name_ttpd,
          b.remarks AS remarks,
          DATE_FORMAT(b.date_report, '%Y-%m-%d') AS date_report_not_formated,
          DATE_FORMAT(b.date_accident, '%Y-%m-%d') AS date_accident_not_formated,
          DATE_FORMAT(b.date_received, '%Y-%m-%d') AS date_receive_not_formated,
          NULL AS images
      FROM
          claims.claims a
              LEFT JOIN
          claims.claims_details b ON a.claim_id = b.claim_id
      WHERE
          a.claim_id = ?
      `,
      req.body.claim_id
    );
    const claimDocuments: any = await prisma.$queryRawUnsafe(
      `
      SELECT 
          a.column_id as id,
          a.label,
          b.claim_type as claim,
          a.claim_id,
          a.reference,
          a.filename
      FROM claims.claims_document a
      left join claims.claims_details b on a.reference = b.claim_reference_no
      where a.claim_id = ?
    `,
      req.body.claim_id
    );

    const totalGross = await prisma.$queryRawUnsafe(
      `SELECT TotalDue FROM ${database}.policy where PolicyNo = ?`,
      req.body.policyNo
    );
    const totalPaidDeposit = await prisma.$queryRawUnsafe(
      `SELECT  ifNull(SUM(Credit),0)  as totalDeposit FROM ${database}.journal where Source_Type = 'OR' and GL_Acct = '1.03.01' and ID_No = ?`,
      req.body.policyNo
    );
    const totalPaidReturned = await prisma.$queryRawUnsafe(
      `SELECT ifNull(SUM(Debit),0) as totalReturned FROM ${database}.journal where Source_Type = 'RC'   and GL_Acct = '1.03.01' and ID_No = ?`,
      req.body.policyNo
    );
    const totalDiscount = await prisma.$queryRawUnsafe(
      `SELECT ifNull(SUM(Debit),0)  as discount FROM upward_insurance_umis.journal where Source_Type = 'GL'  and GL_Acct = '7.10.15'   and ID_No = ?`,
      req.body.policyNo
    );

    if (policyType === "COM" || policyType === "TPL") {
      res.send({
        data: await prisma.$queryRawUnsafe(
          `
            SELECT 
                a.IDNo,
                a.PolicyType,
                a.PolicyNo,
                'UCSMI' AS Department,
                IF(b.company <> ''
                        AND b.company IS NOT NULL,
                    b.company,
                    CONCAT(IF(b.lastname <> ''
                                    AND b.lastname IS NOT NULL,
                                CONCAT(b.lastname, ', '),
                                ''),
                            b.firstname,
                            IF(b.suffix <> '' AND b.suffix IS NOT NULL,
                                CONCAT(', ', b.suffix),
                                ''))) AS Name,
                c.ChassisNo,
                c.MotorNo,
                c.CoverNo,
                c.ORNo,
                c.Model,
                c.Make,
                c.BodyType,
                c.PlateNo,
                a.Account
            FROM
                ${database}.policy a
                    LEFT JOIN
                ${database}.entry_client b ON a.IDNo = b.entry_client_id
                    LEFT JOIN
                ${database}.vpolicy c ON a.PolicyNo = c.PolicyNo
            WHERE
                a.PolicyNo = ?
            `,
          req.body.policyNo
        ),
        payment: {
          totalGross,
          totalPaidDeposit,
          totalPaidReturned,
          totalDiscount,
        },
        claim: {
          claimId: claimDetails[0].claim_id,
          policyNo: req.body.policyNo,
          claimDetails,
          claimDocuments,
        },
        message: "Successfully Generate Claim ID.",
        success: true,
      });
    } else if (policyType === "FIRE") {
      res.send({
        data: await prisma.$queryRawUnsafe(
          `
            SELECT 
                a.IDNo,
                a.PolicyType,
                a.PolicyNo,
                'UCSMI' AS Department,
                IF(b.company <> ''
                        AND b.company IS NOT NULL,
                    b.company,
                    CONCAT(IF(b.lastname <> ''
                                    AND b.lastname IS NOT NULL,
                                CONCAT(b.lastname, ', '),
                                ''),
                            b.firstname,
                            IF(b.suffix <> '' AND b.suffix IS NOT NULL,
                                CONCAT(', ', b.suffix),
                                ''))) AS Name,
                c.*
            FROM
                ${database}.policy a
                    LEFT JOIN
                ${database}.entry_client b ON a.IDNo = b.entry_client_id
                    LEFT JOIN
                ${database}.fpolicy c ON a.PolicyNo = c.PolicyNo
            WHERE
                a.PolicyNo = ?
            `,
          req.body.policyNo
        ),
        payment: {
          totalGross,
          totalPaidDeposit,
          totalPaidReturned,
          totalDiscount,
        },
        claim: {
          claimId: req.body.claim_id,
          policyNo: req.body.policyNo,
          claimDetails,
          claimDocuments,
        },
        message: "Successfully Generate Claim ID.",
        success: true,
      });
    } else if (policyType === "CGL") {
      res.send({
        data: await prisma.$queryRawUnsafe(
          `
            SELECT 
                a.IDNo,
                a.PolicyType,
                a.PolicyNo,
                'UCSMI' AS Department,
                IF(b.company <> ''
                        AND b.company IS NOT NULL,
                    b.company,
                    CONCAT(IF(b.lastname <> ''
                                    AND b.lastname IS NOT NULL,
                                CONCAT(b.lastname, ', '),
                                ''),
                            b.firstname,
                            IF(b.suffix <> '' AND b.suffix IS NOT NULL,
                                CONCAT(', ', b.suffix),
                                ''))) AS Name,
                c.*
            FROM
                ${database}.policy a
                    LEFT JOIN
                ${database}.entry_client b ON a.IDNo = b.entry_client_id
                    LEFT JOIN
                ${database}.cglpolicy c ON a.PolicyNo = c.PolicyNo
            WHERE
                a.PolicyNo = ?
            `,
          req.body.policyNo
        ),
        payment: {
          totalGross,
          totalPaidDeposit,
          totalPaidReturned,
          totalDiscount,
        },
        claim: {
          claimId: claimDetails[0].claim_id,
          policyNo: req.body.policyNo,
          claimDetails,
          claimDocuments,
        },
        message: "Successfully Generate Claim ID.",
        success: true,
      });
    } else if (policyType === "MAR") {
      res.send({
        data: await prisma.$queryRawUnsafe(
          `
            SELECT 
                a.IDNo,
                a.PolicyType,
                a.PolicyNo,
                'UCSMI' AS Department,
                IF(b.company <> ''
                        AND b.company IS NOT NULL,
                    b.company,
                    CONCAT(IF(b.lastname <> ''
                                    AND b.lastname IS NOT NULL,
                                CONCAT(b.lastname, ', '),
                                ''),
                            b.firstname,
                            IF(b.suffix <> '' AND b.suffix IS NOT NULL,
                                CONCAT(', ', b.suffix),
                                ''))) AS Name,
                c.*
            FROM
                ${database}.policy a
                    LEFT JOIN
                ${database}.entry_client b ON a.IDNo = b.entry_client_id
                    LEFT JOIN
                ${database}.mpolicy c ON a.PolicyNo = c.PolicyNo
            WHERE
                a.PolicyNo = ?
            `,
          req.body.policyNo
        ),
        payment: {
          totalGross,
          totalPaidDeposit,
          totalPaidReturned,
          totalDiscount,
        },
        claim: {
          claimId: claimDetails[0].claim_id,
          policyNo: req.body.policyNo,
          claimDetails,
          claimDocuments,
        },
        message: "Successfully Generate Claim ID.",
        success: true,
      });
    } else if (policyType === "MSPR") {
      res.send({
        data: await prisma.$queryRawUnsafe(
          `
            SELECT 
                a.IDNo,
                a.PolicyType,
                a.PolicyNo,
                'UCSMI' AS Department,
                IF(b.company <> ''
                        AND b.company IS NOT NULL,
                    b.company,
                    CONCAT(IF(b.lastname <> ''
                                    AND b.lastname IS NOT NULL,
                                CONCAT(b.lastname, ', '),
                                ''),
                            b.firstname,
                            IF(b.suffix <> '' AND b.suffix IS NOT NULL,
                                CONCAT(', ', b.suffix),
                                ''))) AS Name,
                c.*
            FROM
                ${database}.policy a
                    LEFT JOIN
                ${database}.entry_client b ON a.IDNo = b.entry_client_id
                    LEFT JOIN
                ${database}.msprpolicy c ON a.PolicyNo = c.PolicyNo
            WHERE
                a.PolicyNo = ?
            `,
          req.body.policyNo
        ),
        payment: {
          totalGross,
          totalPaidDeposit,
          totalPaidReturned,
          totalDiscount,
        },
        claim: {
          claimId: claimDetails[0].claim_id,
          policyNo: req.body.policyNo,
          claimDetails,
          claimDocuments,
        },
        message: "Successfully Generate Claim ID.",
        success: true,
      });
    } else if (policyType === "PA") {
      res.send({
        data: await prisma.$queryRawUnsafe(
          `
            SELECT 
                a.IDNo,
                a.PolicyType,
                a.PolicyNo,
                'UCSMI' AS Department,
                IF(b.company <> ''
                        AND b.company IS NOT NULL,
                    b.company,
                    CONCAT(IF(b.lastname <> ''
                                    AND b.lastname IS NOT NULL,
                                CONCAT(b.lastname, ', '),
                                ''),
                            b.firstname,
                            IF(b.suffix <> '' AND b.suffix IS NOT NULL,
                                CONCAT(', ', b.suffix),
                                ''))) AS Name,
                c.*
            FROM
                ${database}.policy a
                    LEFT JOIN
                ${database}.entry_client b ON a.IDNo = b.entry_client_id
                    LEFT JOIN
                ${database}.papolicy c ON a.PolicyNo = c.PolicyNo
            WHERE
                a.PolicyNo = ?
            `,
          req.body.policyNo
        ),
        payment: {
          totalGross,
          totalPaidDeposit,
          totalPaidReturned,
          totalDiscount,
        },
        claim: {
          claimId: claimDetails[0].claim_id,
          policyNo: req.body.policyNo,
          claimDetails,
          claimDocuments,
        },
        message: "Successfully Generate Claim ID.",
        success: true,
      });
    } else {
      res.send({
        data: await prisma.$queryRawUnsafe(
          `
            SELECT 
                a.IDNo,
                a.PolicyType,
                a.PolicyNo,
                'UCSMI' AS Department,
                IF(b.company <> ''
                        AND b.company IS NOT NULL,
                    b.company,
                    CONCAT(IF(b.lastname <> ''
                                    AND b.lastname IS NOT NULL,
                                CONCAT(b.lastname, ', '),
                                ''),
                            b.firstname,
                            IF(b.suffix <> '' AND b.suffix IS NOT NULL,
                                CONCAT(', ', b.suffix),
                                ''))) AS Name,
                c.*
            FROM
                ${database}.policy a
                    LEFT JOIN
                ${database}.entry_client b ON a.IDNo = b.entry_client_id
                    LEFT JOIN
                ${database}.bpolicy c ON a.PolicyNo = c.PolicyNo
            WHERE
                a.PolicyNo = ?
            `,
          req.body.policyNo
        ),
        payment: {
          totalGross,
          totalPaidDeposit,
          totalPaidReturned,
          totalDiscount,
        },
        claim: {
          claimId: claimDetails[0].claim_id,
          policyNo: req.body.policyNo,
          claimDetails,
          claimDocuments,
        },
        message: "Successfully Generate Claim ID.",
        success: true,
      });
    }
  } catch (error: any) {
    console.log(error.message);
    res.send({
      data: "",
      message: `We're experiencing a server issue. Please try again in a few minutes. If the issue continues, report it to IT with the details of what you were doing at the time.`,
      success: false,
    });
  }
});
Claims.post("/delete-claim", async (req, res): Promise<any> => {
  try {
    const claimId = req.body.claimId;
    const claimDir = path.join(uploadDir, claimId);

    if (
      req.body.isUpdate &&
      !(await saveUserLogsCode(req, "update", claimId, "Claims"))
    ) {
      return res.send({ message: "Invalid User Code", success: false });
    }

    await prisma.$queryRawUnsafe(
      "delete FROM claims.claims where claim_id = ? ",
      claimId
    );
    await prisma.$queryRawUnsafe(
      "delete FROM claims.claims_details where claim_id = ? ",
      claimId
    );
    await prisma.$queryRawUnsafe(
      "delete FROM claims.claims_document where claim_id = ? ",
      claimId
    );

    if (fs.existsSync(claimDir)) {
      await fs.rm(claimDir, { recursive: true });
    }

    res.send({
      message: `Successfully Delete Claim ID: ${claimId}`,
      success: true,
    });
  } catch (error: any) {
    console.log(error.message);
    res.send({
      message: `We're experiencing a server issue. Please try again in a few minutes. If the issue continues, report it to IT with the details of what you were doing at the time.`,
      success: false,
    });
  }
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const claimId = JSON.parse(req.body.metadata).claimId;
    const refNo = JSON.parse(req.body.metadata).reference;
    const documentId = JSON.parse(req.body.metadata).documentId;
    const claimDir = path.join(uploadDir, claimId, refNo, documentId);

    if (!fs.existsSync(claimDir)) {
      fs.mkdirSync(claimDir, { recursive: true });
    }
    cb(null, claimDir);
  },
  filename: (req, file, cb) => {
    // Keep original filename but add a timestamp to prevent overwriting
    cb(null, `${uuidV4()}.${file.originalname.split(".").pop()}`);
  },
});
const upload = multer({
  storage,
});
Claims.post(
  "/save-claim",
  upload.array("files"),
  async (req, res): Promise<any> => {
    try {
      res.send({
        data: [],
        message: "Successfully Generate Claim ID.",
        success: true,
      });
    } catch (error: any) {
      console.log(error);
      res.send({
        data: [],
        message: `We're experiencing a server issue. Please try again in a few minutes. If the issue continues, report it to IT with the details of what you were doing at the time.`,
        success: false,
      });
    }
  }
);
async function getUserById(UserId: string) {
  return await prisma.users.findUnique({
    where: { UserId },
  });
}
export async function saveUserLogsCode(
  req: any,
  action: string,
  dataString: string,
  module: string
) {
  const user = await getUserById((req.user as any).UserId);

  if (
    compareSync(
      req.body.userCodeConfirmation,
      user?.userConfirmationCode as string
    )
  ) {
    await prisma.system_logs.create({
      data: {
        action,
        username: user?.Username as string,
        dataString,
        createdAt: new Date(),
        user_id: user?.UserId as string,
        module,
        account_type: user?.AccountType as string,
      },
    });

    return true;
  }
  return false;
}
export async function saveUserLogs(
  req: any,
  dataString: string,
  action: string,
  module: string
) {
  const user = await getUserById((req.user as any).UserId);
  await prisma.system_logs.create({
    data: {
      action,
      username: user?.Username as string,
      dataString,
      createdAt: new Date(),
      user_id: user?.UserId as string,
      module,
      account_type: user?.AccountType as string,
    },
  });
}
async function generateUniqueClaimID() {
  let uniqueID;
  let exists = true;

  while (exists) {
    uniqueID = Math.floor(100000000 + Math.random() * 900000000);

    // Check if it exists
    const rows = (await prisma.$queryRawUnsafe(
      "SELECT COUNT(*) AS count FROM claims_details WHERE claim_reference_no = ?",
      uniqueID
    )) as Array<any>;
    if (parseInt(rows[0].count) === 0) {
      exists = false;
    }
  }

  return `${uniqueID}`;
}

// const isUpdate = req.body.isUpdate === "true";
// const header = JSON.parse(req.body.header);
// const claimId = header.claimId;

// if (
//   isUpdate &&
//   !(await saveUserLogsCode(req, "update", claimId, "Claims"))
// ) {
//   return res.send({ message: "Invalid User Code", success: false });
// }

// const claimDir = path.join(uploadDir, claimId);

// const details = JSON.parse(req.body.details);
// const metadata = JSON.parse(req.body.metadata);

// if (isUpdate) {
//   await prisma.$queryRawUnsafe(
//     "delete FROM claims.claims where claim_id = ? ",
//     claimId
//   );
//   await prisma.$queryRawUnsafe(
//     "delete FROM claims.claims_details where claim_id = ? ",
//     claimId
//   );
//   await prisma.$queryRawUnsafe(
//     "delete FROM claims.claims_document where claim_id = ? ",
//     claimId
//   );
//   if (fs.existsSync(claimDir)) {
//     await fs.rm(claimDir, { recursive: true });
//   }
// }

// if (!fs.existsSync(claimDir)) {
//   fs.mkdirSync(claimDir, { recursive: true });
// }
// const files = req.files as Express.Multer.File[];
// if (files.length > 0) {
//   for (let i = 0; i < files.length; i++) {
//     await saveFile(files[i], metadata[i]);
//   }
// }

// await prisma.claims.create({
//   data: {
//     claim_id: header.claimId,
//     policyNo: header.policyId,
//   },
// });
// for (const itm of details) {
//   await prisma.claims_details.create({
//     data: {
//       claim_id: header.claimId,
//       claim_reference_no: itm[0],
//       claim_type: itm[1],
//       date_report: new Date(itm[12]),
//       date_accident: new Date(itm[13]),
//       date_received:
//         itm[14] && itm[14] !== "" ? new Date(itm[14]) : undefined,
//       status: itm[4],
//       amount_claim: parseFloat(itm[6].replace(/,/g, "")),
//       amount_approved: parseFloat(itm[7].replace(/,/g, "")),
//       participation: parseFloat(itm[8].replace(/,/g, "")),
//       net_amount: parseFloat(itm[9].replace(/,/g, "")),
//       name_ttpd: itm[10],
//       remarks: itm[11],
//     },
//   });
// }

// if (!isUpdate) {
//   await saveUserLogs(req, claimId, "add", "Claims");
// }

export default Claims;
