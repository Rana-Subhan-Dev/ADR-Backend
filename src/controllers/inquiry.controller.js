const inquiryService = require("../services/inquiry.service");
const ApiResponse = require("../utils/apiResponse");
const asyncHandler = require("../utils/asyncHandler");

const createInquiry = asyncHandler(async (req, res) => {
  const result = await inquiryService.createInquiry(req.body);

  return res
    .status(201)
    .json(new ApiResponse(201, result, "Inquiry created successfully."));
});

const getInquiries = asyncHandler(async (req, res) => {
  const result = await inquiryService.getInquiries(req.query);

  return res
    .status(200)
    .json(new ApiResponse(200, result, "Inquiries fetched successfully."));
});

const getInquiryById = asyncHandler(async (req, res) => {
  const result = await inquiryService.getInquiryById(req.params.id);

  return res
    .status(200)
    .json(new ApiResponse(200, result, "Inquiry fetched successfully."));
});

const updateInquiry = asyncHandler(async (req, res) => {
  const result = await inquiryService.updateInquiry(req.params.id, req.body);

  return res
    .status(200)
    .json(new ApiResponse(200, result, "Inquiry updated successfully."));
});

const convertToCase = asyncHandler(async (req, res) => {
  const result = await inquiryService.convertToCase(req.params.id, req.body);

  return res
    .status(201)
    .json(
      new ApiResponse(201, result, "Inquiry converted to a case successfully."),
    );
});

module.exports = {
  createInquiry,
  getInquiries,
  getInquiryById,
  updateInquiry,
  convertToCase,
};
