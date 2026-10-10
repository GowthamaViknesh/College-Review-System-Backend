import type { RequestHandler } from 'express';
import * as reviewService from '../services/review.service';
import { setAudit } from '../common/middlewares/audit.middleware';

export const listReviews: RequestHandler = async (req, res) => {
    const { reviews, meta } = await reviewService.listReviews(req.query as any);
    res.json({ success: true, data: { reviews }, meta });
};

export const getReview: RequestHandler<{ id: string }> = async (req, res) => {
    const review = await reviewService.getReviewById(req.params.id);
    res.json({ success: true, data: { review } });
};

export const createReview: RequestHandler = async (req, res) => {
    setAudit(res, { details: { college: req.body.college, rating: req.body.rating } });

    const review = await reviewService.createReview(req.user!.id, req.body);
    setAudit(res, { targetId: review.reviewId });
    res.status(201).json({ success: true, data: { review } });
};

export const updateReview: RequestHandler<{ id: string }> = async (req, res) => {
    setAudit(res, { details: { changed: Object.keys(req.body), ...(req.body.rating && { rating: req.body.rating }) } });

    const review = await reviewService.updateReview(req.user!.id, req.params.id, req.body);
    res.json({ success: true, data: { review } });
};

export const deleteReview: RequestHandler<{ id: string }> = async (req, res) => {
    await reviewService.deleteReview(req.user!.id, req.permissions!, req.params.id);
    res.status(204).send();
};

export const upvoteReview: RequestHandler<{ id: string }> = async (req, res) => {
    const { review, changed } = await reviewService.upvoteReview(req.user!, req.params.id);
    // A repeated upvote changed nothing, so it has no place in the action log
    setAudit(res, { skip: !changed });
    res.json({ success: true, data: { review } });
};

export const removeUpvote: RequestHandler<{ id: string }> = async (req, res) => {
    const { review, changed } = await reviewService.removeUpvote(req.user!, req.params.id);
    setAudit(res, { skip: !changed });
    res.json({ success: true, data: { review } });
};
