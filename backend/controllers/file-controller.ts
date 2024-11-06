import { NextFunction, Request, Response } from "express";
import FileService from "../services/file-service/file-service";
import User, { UserInterface } from "../models/user-model";
import {
  createStreamVideoCookie,
  removeStreamVideoCookie,
} from "../cookies/create-cookies";
import ChunkService from "../services/chunk-service/chunk-service";
import streamToBuffer from "../utils/streamToBuffer";
import env from "../enviroment/env";
import getFileSize from "../services/chunk-service/utils/getFileSize";
import File, { FileMetadateInterface } from "../models/file-model";
import imageChecker from "../utils/imageChecker";
import videoChecker from "../utils/videoChecker";
import createVideoThumbnail from "../services/chunk-service/utils/createVideoThumbnail";
import NotAuthorizedError from "../utils/NotAuthorizedError";
import createThumbnail from "../services/chunk-service/utils/createImageThumbnail";
import { FileListQueryType } from "../types/file-types";

const fileService = new FileService();
type userAccessType = {
  _id: string;
  emailVerified: boolean;
  email: string;
  s3Enabled: boolean;
};

interface RequestTypeFullUser extends Request {
  user?: UserInterface;
  encryptedToken?: string;
  accessTokenStreamVideo?: string;
}

interface RequestType extends Request {
  user?: userAccessType;
  encryptedToken?: string;
}

class FileController {
  chunkService;

  constructor() {
    this.chunkService = new ChunkService();
  }

  getThumbnail = async (req: RequestTypeFullUser, res: Response) => {
    if (!req.user) {
      return;
    }
    let responseSent = false;
    try {
      const user = req.user;
      const id = req.params.id;

      const { readStream, decipher } = await this.chunkService.getThumbnail(
        user,
        id
      );

      readStream.on("error", (e: Error) => {
        console.log("Get thumbnail read stream error", e);
        if (!responseSent) {
          responseSent = true;
          res.status(500).send("Server error getting thumbnail");
        }
      });

      decipher.on("error", (e: Error) => {
        console.log("Get thumbnail decipher error", e);
        if (!responseSent) {
          responseSent = true;
          res.status(500).send("Server error getting thumbnail");
        }
      });

      const bufferData = await streamToBuffer(readStream.pipe(decipher));

      res.send(bufferData);
    } catch (e: unknown) {
      if (e instanceof Error) {
        console.log("\nGet Thumbnail Error File Route:", e.message);
      }
      if (!responseSent) {
        responseSent = true;
        res.status(500).send("Server error getting thumbnail");
      }
    }
  };

  getFullThumbnail = async (req: RequestTypeFullUser, res: Response) => {
    if (!req.user) {
      return;
    }
    let responseSent = false;
    try {
      const user = req.user;
      const fileID = req.params.id;

      const { decipher, readStream, file } =
        await this.chunkService.getFullThumbnail(user, fileID);

      readStream.on("error", (e: Error) => {
        console.log("Get full thumbnail read stream error", e);
        if (!responseSent) {
          responseSent = true;
          res.status(500).send("Server error getting full thumbnail");
        }
      });

      decipher.on("error", (e: Error) => {
        console.log("Get full thumbnail decipher error", e);
        if (!responseSent) {
          responseSent = true;
          res.status(500).send("Server error gettingfull thumbnail");
        }
      });

      res.set("Content-Type", "binary/octet-stream");
      res.set(
        "Content-Disposition",
        'attachment; filename="' + file.filename + '"'
      );
      res.set("Content-Length", file.metadata.size.toString());

      readStream.pipe(decipher).pipe(res);
    } catch (e: unknown) {
      if (e instanceof Error) {
        console.log("\nGet Thumbnail Full Error File Route:", e.message);
      }
      res.status(500).send("Server error getting image");
    }
  };

  uploadFile = async (req: RequestTypeFullUser, res: Response) => {
    if (!req.user) {
      return;
    }

    let responseSent = false;

    const handleError = () => {
      if (!responseSent) {
        responseSent = true;
        res.writeHead(500, { Connection: "close" });
        res.end();
      }
    };

    const handleFinish = async (
      filename: string,
      metadata: FileMetadateInterface
    ) => {
      try {
        const user = req.user;

        if (!user) throw new NotAuthorizedError("User Not Authorized");

        const date = new Date();

        let length = 0;

        if (env.dbType === "fs" && metadata.filePath) {
          length = (await getFileSize(metadata.filePath)) as number;
        } else {
          // TODO: Fix this we should be using the encrypted file size
          length = metadata.size;
        }

        const currentFile = new File({
          filename,
          uploadDate: date.toISOString(),
          length,
          metadata,
        });

        await currentFile.save();

        const imageCheck = imageChecker(currentFile.filename);
        const videoCheck = videoChecker(currentFile.filename);

        if (videoCheck) {
          const updatedFile = await createVideoThumbnail(
            currentFile,
            filename,
            user
          );

          res.send(updatedFile);
        } else if (currentFile.length < 15728640 && imageCheck) {
          const updatedFile = await createThumbnail(
            currentFile,
            filename,
            user
          );

          res.send(updatedFile);
        } else {
          res.send(currentFile);
        }
      } catch (e: unknown) {
        if (!responseSent) {
          res.writeHead(500, { Connection: "close" });
          res.end();
        }
      }
    };

    try {
      const user = req.user;
      const busboy = req.busboy;

      busboy.on("error", (e: Error) => {
        console.log("busboy error", e);
        handleError();
      });

      req.pipe(busboy);

      const { cipher, fileWriteStream, emitter, metadata, filename } =
        await this.chunkService.uploadFile(user, busboy, req);

      cipher.on("error", (e: Error) => {
        console.log("cipher error", e);
        handleError();
      });

      fileWriteStream.on("error", (e: Error) => {
        console.log("file write stream error", e);
        handleError();
      });

      if (emitter) {
        emitter.on("finish", async () => {
          await handleFinish(filename, metadata);
        });
      } else {
        fileWriteStream.on("finish", async () => {
          await handleFinish(filename, metadata);
        });
      }

      cipher.pipe(fileWriteStream);
    } catch (e: unknown) {
      if (!responseSent) {
        res.writeHead(500, { Connection: "close" });
        if (e instanceof Error) {
          console.log("\nUploading File Error File Route:", e.message);
          res.end(e.message);
        } else {
          console.log("\nUploading File Error File Route:", e);
          res.end("Server error uploading file");
        }
      }
    }
  };

  getPublicDownload = async (req: RequestType, res: Response) => {
    let responseSent = false;
    try {
      const ID = req.params.id;
      const tempToken = req.params.tempToken;

      const { readStream, decipher, file } =
        await this.chunkService.getPublicDownload(ID, tempToken, res);

      readStream.on("error", (e: Error) => {
        console.log("read stream error", e);
      });

      decipher.on("error", (e: Error) => {
        console.log("decipher stream error", e);
      });

      res.set("Content-Type", "binary/octet-stream");
      res.set(
        "Content-Disposition",
        'attachment; filename="' + file.filename + '"'
      );
      res.set("Content-Length", file.metadata.size.toString());

      readStream.pipe(decipher).pipe(res);
    } catch (e: unknown) {
      if (e instanceof Error) {
        console.log("\nGet Public Download Error File Route:", e.message);
      }
    }
  };

  removeLink = async (req: RequestType, res: Response, next: NextFunction) => {
    if (!req.user) {
      return;
    }

    try {
      const id = req.params.id;
      const userID = req.user._id;

      const file = await fileService.removeLink(userID, id);

      res.send(file);
    } catch (e) {
      next(e);
    }
  };

  makePublic = async (req: RequestType, res: Response, next: NextFunction) => {
    if (!req.user) {
      return;
    }

    try {
      const fileID = req.params.id;
      const userID = req.user._id;

      const { file, token } = await fileService.makePublic(userID, fileID);

      res.send({ file, token });
    } catch (e) {
      next(e);
    }
  };

  getPublicInfo = async (
    req: RequestType,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const id = req.params.id;
      const tempToken = req.params.tempToken;

      const file = await fileService.getPublicInfo(id, tempToken);

      res.send(file);
    } catch (e) {
      next(e);
    }
  };

  makeOneTimePublic = async (
    req: RequestType,
    res: Response,
    next: NextFunction
  ) => {
    if (!req.user) {
      return;
    }

    try {
      const id = req.params.id;
      const userID = req.user._id;

      const { file, token } = await fileService.makeOneTimePublic(userID, id);

      res.send({ file, token });
    } catch (e) {
      next(e);
    }
  };

  getFileInfo = async (req: RequestType, res: Response, next: NextFunction) => {
    if (!req.user) {
      return;
    }

    try {
      const fileID = req.params.id;
      const userID = req.user._id;

      const file = await fileService.getFileInfo(userID, fileID);

      res.send(file);
    } catch (e) {
      next(e);
    }
  };

  getQuickList = async (
    req: RequestType,
    res: Response,
    next: NextFunction
  ) => {
    if (!req.user) {
      return;
    }

    try {
      const user = req.user;
      const limit = Number.parseInt(req.query.limit as string) || 20;

      const quickList = await fileService.getQuickList(user, limit);

      res.send(quickList);
    } catch (e) {
      next(e);
    }
  };

  getList = async (req: RequestType, res: Response, next: NextFunction) => {
    if (!req.user) {
      return;
    }

    try {
      const userID = req.user._id;
      const query = req.query;

      const search = (query.search as string) || undefined;
      const parent = (query.parent as string) || "/";
      const limit = Number.parseInt(query.limit as string) || 50;
      const sortBy = (query.sortBy as string) || "date_desc";
      const startAtDate = (query.startAtDate as string) || undefined;
      const startAtName = (query.startAtName as string) || undefined;
      const trashMode = query.trashMode === "true";
      const mediaMode = query.mediaMode === "true";
      const mediaFilter = (query.mediaFilter as string) || "all";

      const queryData: FileListQueryType = {
        userID,
        search,
        parent,
        startAtDate,
        startAtName,
        trashMode,
        mediaMode,
        sortBy,
        mediaFilter,
      };

      const fileList = await fileService.getList(queryData, sortBy, limit);

      res.send(fileList);
    } catch (e) {
      next(e);
    }
  };

  getDownloadToken = async (
    req: RequestTypeFullUser,
    res: Response,
    next: NextFunction
  ) => {
    if (!req.user) {
      return;
    }

    try {
      const user = req.user;

      const tempToken = await fileService.getDownloadToken(user);

      res.send({ tempToken });
    } catch (e) {
      next(e);
    }
  };

  getAccessTokenStreamVideo = async (
    req: RequestTypeFullUser,
    res: Response,
    next: NextFunction
  ) => {
    if (!req.user) return;

    try {
      const user = req.user;

      const currentUUID = req.headers.uuid as string;

      const streamVideoAccessToken = await user.generateAuthTokenStreamVideo(
        currentUUID
      );

      createStreamVideoCookie(res, streamVideoAccessToken);

      res.send();
    } catch (e) {
      next(e);
    }
  };

  removeStreamVideoAccessToken = async (
    req: RequestTypeFullUser,
    res: Response,
    next: NextFunction
  ) => {
    if (!req.user) return;

    try {
      const userID = req.user._id;

      const accessTokenStreamVideo = req.accessTokenStreamVideo!;

      if (!accessTokenStreamVideo) {
        throw new NotAuthorizedError("No Access Token");
      }

      await User.updateOne(
        { _id: userID },
        { $pull: { tempTokens: { token: accessTokenStreamVideo } } }
      );

      removeStreamVideoCookie(res);

      res.send();
    } catch (e) {
      next(e);
    }
  };

  removeTempToken = async (
    req: RequestTypeFullUser,
    res: Response,
    next: NextFunction
  ) => {
    if (!req.user) {
      return;
    }

    try {
      const user = req.user;
      const tempToken = req.params.tempToken;
      const currentUUID = req.params.uuid;

      await fileService.removeTempToken(user, tempToken, currentUUID);

      res.send();
    } catch (e) {
      next(e);
    }
  };

  streamVideo = async (req: RequestTypeFullUser, res: Response) => {
    if (!req.user) {
      return;
    }
    let responseSent = false;

    try {
      const user = req.user;
      const fileID = req.params.id;
      const headers = req.headers;

      const { decipher, readStream, head } =
        await this.chunkService.streamVideo(user, fileID, headers);

      const cleanUp = () => {
        if (readStream) readStream.destroy();
        if (decipher) decipher.end();
      };

      const handleError = (e: Error) => {
        console.log("stream video read stream error", e);
        cleanUp();
      };

      readStream.on("error", handleError);

      decipher.on("error", handleError);

      readStream.on("end", () => {
        if (!responseSent) {
          responseSent = true;
          res.end();
        }
        cleanUp();
      });

      readStream.on("close", () => {
        cleanUp();
      });

      decipher.on("end", () => {
        if (!responseSent) {
          responseSent = true;
          res.end();
        }
        cleanUp();
      });

      decipher.on("close", () => {
        cleanUp();
      });

      res.writeHead(206, head);

      readStream.pipe(decipher).pipe(res);
    } catch (e: unknown) {
      if (e instanceof Error) {
        console.log("\nStream Video Error File Route:", e.message);
      }
    }
  };

  downloadFile = async (req: RequestTypeFullUser, res: Response) => {
    if (!req.user) {
      return;
    }

    try {
      const user = req.user;
      const fileID = req.params.id;

      const { readStream, decipher, file } =
        await this.chunkService.downloadFile(user, fileID, res);

      readStream.on("error", (e: Error) => {
        console.log("read stream error", e);
      });

      decipher.on("error", (e: Error) => {
        console.log("decipher stream errozr", e);
      });

      res.set("Content-Type", "binary/octet-stream");
      res.set(
        "Content-Disposition",
        'attachment; filename="' + file.filename + '"'
      );
      res.set("Content-Length", file.metadata.size.toString());

      readStream.pipe(decipher).pipe(res);
    } catch (e: unknown) {
      if (e instanceof Error) {
        console.log("\nDownload File Error File Route:", e.message);
      }
    }
  };

  getSuggestedList = async (
    req: RequestType,
    res: Response,
    next: NextFunction
  ) => {
    if (!req.user) {
      return;
    }

    try {
      const userID = req.user._id;
      const searchQuery = req.query.search as string;
      const trashMode = req.query.trashMode === "true";
      const mediaMode = req.query.mediaMode === "true";

      const { fileList, folderList } = await fileService.getSuggestedList(
        userID,
        searchQuery,
        trashMode,
        mediaMode
      );

      return res.send({ folderList, fileList });
    } catch (e) {
      next(e);
    }
  };

  renameFile = async (req: RequestType, res: Response, next: NextFunction) => {
    if (!req.user) {
      return;
    }

    try {
      const fileID = req.body.id;
      const title = req.body.title;
      const userID = req.user._id;

      await fileService.renameFile(userID, fileID, title);

      res.send();
    } catch (e) {
      next(e);
    }
  };

  moveFile = async (req: RequestType, res: Response, next: NextFunction) => {
    if (!req.user) {
      return;
    }

    try {
      const fileID = req.body.id as string;
      const userID = req.user._id as string;
      const parentID = (req.body.parentID as string) || "/";

      await fileService.moveFile(userID, fileID, parentID);

      res.send();
    } catch (e) {
      next(e);
    }
  };

  trashFile = async (req: RequestType, res: Response, next: NextFunction) => {
    if (!req.user) {
      return;
    }

    try {
      const userID = req.user._id;
      const fileID = req.body.id;

      const trashedFile = await fileService.trashFile(userID, fileID);

      res.send(trashedFile.toObject());
    } catch (e) {
      next(e);
    }
  };

  restoreFile = async (req: RequestType, res: Response, next: NextFunction) => {
    if (!req.user) {
      return;
    }

    try {
      const userID = req.user._id;
      const fileID = req.body.id;

      const file = await fileService.restoreFile(userID, fileID);

      res.send(file);
    } catch (e) {
      next(e);
    }
  };

  deleteFile = async (req: RequestType, res: Response, next: NextFunction) => {
    if (!req.user) {
      return;
    }

    try {
      const userID = req.user._id;
      const fileID = req.body.id;

      await this.chunkService.deleteFile(userID, fileID);

      res.send();
    } catch (e) {
      next(e);
    }
  };

  deleteMulti = async (req: RequestType, res: Response, next: NextFunction) => {
    if (!req.user) {
      return;
    }

    try {
      const userID = req.user._id;
      const items = req.body.items;

      await this.chunkService.deleteMulti(userID, items);

      res.send();
    } catch (e) {
      next(e);
    }
  };

  trashMulti = async (req: RequestType, res: Response, next: NextFunction) => {
    if (!req.user) {
      return;
    }

    try {
      const userID = req.user._id;
      const items = req.body.items;

      await fileService.trashMulti(userID, items);

      res.send();
    } catch (e) {
      next(e);
    }
  };

  restoreMulti = async (
    req: RequestType,
    res: Response,
    next: NextFunction
  ) => {
    if (!req.user) {
      return;
    }

    try {
      const userID = req.user._id;
      const items = req.body.items;

      await fileService.restoreMulti(userID, items);

      res.send();
    } catch (e) {
      next(e);
    }
  };
}

export default FileController;
