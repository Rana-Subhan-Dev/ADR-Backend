const contactService = require("../services/contact.service");
const ApiResponse = require("../utils/apiResponse");
const asyncHandler = require("../utils/asyncHandler");

const getContacts = asyncHandler(async (req, res) =>
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        await contactService.getContacts(req.query, req.user),
        "Contacts fetched successfully.",
      ),
    ),
);

const getContact = asyncHandler(async (req, res) =>
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        await contactService.getContactById(req.params.contactId, req.user),
        "Contact fetched successfully.",
      ),
    ),
);

const createContact = asyncHandler(async (req, res) =>
  res
    .status(201)
    .json(
      new ApiResponse(
        201,
        await contactService.createContact(req.body, req.user),
        "Contact created successfully.",
      ),
    ),
);

const updateContact = asyncHandler(async (req, res) =>
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        await contactService.updateContact(
          req.params.contactId,
          req.body,
          req.user,
        ),
        "Contact updated successfully.",
      ),
    ),
);

const deleteContact = asyncHandler(async (req, res) =>
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        await contactService.deleteContact(req.params.contactId, req.user),
        "Contact deleted successfully.",
      ),
    ),
);

module.exports = {
  getContacts,
  getContact,
  createContact,
  updateContact,
  deleteContact,
};
