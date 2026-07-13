import { Router } from 'express';
import { z } from 'zod';

import { asyncHandler } from '../middlewares/asyncHandler';
import { authenticate } from '../middlewares/auth';
import { authorize } from '../middlewares/authorize';
import {
  enqueueReportExport,
  getReportExportJob,
  type ReportExportFormat,
} from '../utils/reports/exportService';

const router = Router();

const exportReportSchema = z.object({
  format: z.enum(['pdf', 'xlsx']).default('pdf'),
  fromDate: z.string().trim().min(1),
  toDate: z.string().trim().min(1),
  restaurantName: z.string().trim().max(100).optional(),
});

const parseDate = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

router.post(
  '/export',
  authenticate,
  authorize('admin'),
  asyncHandler(async (req, res) => {
    const parsed = exportReportSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: 'validation_error',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const from = parseDate(parsed.data.fromDate);
    const to = parseDate(parsed.data.toDate);

    if (!from || !to || from > to) {
      return res.status(400).json({ message: 'invalid_date_range' });
    }

    const isAsync = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1 > 30;

    if (isAsync) {
      const job = await enqueueReportExport({
        format: parsed.data.format as ReportExportFormat,
        fromDate: parsed.data.fromDate,
        toDate: parsed.data.toDate,
        ...(parsed.data.restaurantName ? { restaurantName: parsed.data.restaurantName } : {}),
      });

      return res.status(202).json({
        message: 'report_generation_started',
        jobId: job.id,
        status: job.status,
        statusUrl: `/api/reports/export/${job.id}`,
      });
    }

    const result = await enqueueReportExport({
      format: parsed.data.format as ReportExportFormat,
      fromDate: parsed.data.fromDate,
      toDate: parsed.data.toDate,
      ...(parsed.data.restaurantName ? { restaurantName: parsed.data.restaurantName } : {}),
    }, true);

    const exportResult = result.result;
    return res.status(200).json({
      message: 'report_ready',
      fileName: exportResult?.fileName,
      downloadUrl: exportResult?.downloadUrl,
      expiresAt: exportResult?.expiresAt,
    });
  })
);

router.get(
  '/export/:jobId',
  authenticate,
  authorize('admin'),
  asyncHandler(async (req, res) => {
    const jobId = typeof req.params.jobId === 'string' ? req.params.jobId : '';
    const job = getReportExportJob(jobId);
    if (!job) {
      return res.status(404).json({ message: 'job_not_found' });
    }

    return res.status(200).json(job);
  })
);

export default router;
