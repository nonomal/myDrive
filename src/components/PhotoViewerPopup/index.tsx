import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppDispatch, useAppSelector } from "../../hooks/store";
import {
  deleteVideoTokenAPI,
  getFileFullThumbnailAPI,
  getVideoTokenAPI,
} from "../../api/filesAPI";
import CloseIcon from "../../icons/CloseIcon";
import ActionsIcon from "../../icons/ActionsIcon";
import { useContextMenu } from "../../hooks/contextMenu";
import ContextMenu from "../ContextMenu";
import { resetPopupSelect, setPopupSelect } from "../../reducers/selected";
import { useClickOutOfBounds } from "../../hooks/utils";
import CircleLeftIcon from "../../icons/CircleLeftIcon";
import CircleRightIcon from "../../icons/CircleRightIcon";
import { useFiles, useQuickFiles } from "../../hooks/files";
import { FileInterface } from "../../types/file";
import { InfiniteData } from "react-query";
import { getFileColor, getFileExtension } from "../../utils/files";

const PhotoViewerPopup = memo(() => {
  const [image, setImage] = useState("");
  const [video, setVideo] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const file = useAppSelector((state) => state.selected.popupModal.file)!;
  const type = useAppSelector((state) => state.selected.popupModal.type)!;
  const finalLastPageLoaded = useRef(false);
  const loadingNextPage = useRef(false);
  const { data: quickFiles } = useQuickFiles(false);
  const { data: files, fetchNextPage } = useFiles(false);
  const dispatch = useAppDispatch();
  const {
    onContextMenu,
    closeContextMenu,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    clickStopPropagation,
    ...contextMenuState
  } = useContextMenu();

  const fileExtension = useMemo(
    () => getFileExtension(file.filename, 3),
    [file.filename]
  );

  const imageColor = useMemo(
    () => getFileColor(file.filename),
    [file.filename]
  );

  console.log("rerender");

  const outOfBoundsClick = useCallback(
    (e: any) => {
      console.log("out of bounds click", e);
      if (e?.target?.id !== "outer-wrapper") return;
      console.log("out of bounds click2");
      dispatch(resetPopupSelect());
    },
    [resetPopupSelect]
  );

  const { wrapperRef } = useClickOutOfBounds(outOfBoundsClick);

  const getImage = useCallback(async () => {
    const imageData = await getFileFullThumbnailAPI(file._id);
    const imgFile = new Blob([imageData]);
    const imgUrl = URL.createObjectURL(imgFile);
    setImage(imgUrl);
  }, [file._id, getFileFullThumbnailAPI]);

  const getVideo = useCallback(async () => {
    // TODO: Change this
    await getVideoTokenAPI();
    const videoURL = `http://localhost:5173/api/file-service/stream-video/${file._id}`;
    console.log("video url", videoURL);
    setVideo(videoURL);
  }, [file._id, getVideoTokenAPI]);

  const cleanUpVideo = useCallback(async () => {
    if (!file.metadata.isVideo || !videoRef.current) return;

    deleteVideoTokenAPI();

    videoRef.current.pause();
    videoRef.current.src = "";
    setVideo("");
  }, [file._id, deleteVideoTokenAPI]);

  const findPrevFilesItem = (newFiles?: InfiniteData<FileInterface[]>) => {
    if (newFiles) {
      if (!newFiles?.pages) return 0;
      const filesFiltered = newFiles.pages
        .flat()
        .filter(
          (currentFile) =>
            currentFile.metadata.hasThumbnail || currentFile.metadata.isVideo
        );
      const index = filesFiltered.findIndex(
        (currentFile) => currentFile._id === file._id
      );
      const prevItem = filesFiltered[index - 1];
      return prevItem;
    } else {
      if (!files?.pages) return 0;
      const filesFiltered = files.pages
        .flat()
        .filter(
          (currentFile) =>
            currentFile.metadata.hasThumbnail || currentFile.metadata.isVideo
        );
      const index = filesFiltered.findIndex(
        (currentFile) => currentFile._id === file._id
      );
      const prevItem = filesFiltered[index - 1];
      return prevItem;
    }
  };

  const goToPreviousItem = async () => {
    if (type === "quick-item") {
      if (!quickFiles?.length) return 0;
      const filteredQuickFiles = quickFiles.filter(
        (currentFile) =>
          currentFile.metadata.hasThumbnail || currentFile.metadata.isVideo
      );
      const index = filteredQuickFiles.findIndex(
        (currentFile) => currentFile._id === file._id
      );
      const prevItem = filteredQuickFiles[index - 1];
      if (prevItem) {
        dispatch(setPopupSelect({ type: "quick-item", file: prevItem }));
      }
    } else {
      if (!files?.pages) return 0;
      const prevItem = findPrevFilesItem();
      console.log("prev item", prevItem);
      if (prevItem) {
        dispatch(setPopupSelect({ type: "file", file: prevItem }));
      }
      // TODO: Perhaps implement this if needed in the future
      //   else {
      //     console.log("fetch prev");
      //     const response = await fetchPreviousPage();
      //     if (!response.data?.pages) return;
      //     const fetchedPrevItem = findPrevFilesItem(response.data);
      //     if (fetchedPrevItem) {
      //       dispatch(setPopupSelect({ type: "file", file: fetchedPrevItem }));
      //     }
      //   }
    }
  };

  const findNextFilesItem = (newFiles?: InfiniteData<FileInterface[]>) => {
    if (newFiles) {
      if (!newFiles?.pages) return 0;
      const filesFiltered = newFiles.pages
        .flat()
        .filter(
          (currentFile) =>
            currentFile.metadata.hasThumbnail || currentFile.metadata.isVideo
        );
      const index = filesFiltered.findIndex(
        (currentFile) => currentFile._id === file._id
      );
      const nextItem = filesFiltered[index + 1];
      return nextItem;
    } else {
      if (!files?.pages) return 0;
      const filesFiltered = files.pages
        .flat()
        .filter(
          (currentFile) =>
            currentFile.metadata.hasThumbnail || currentFile.metadata.isVideo
        );
      const index = filesFiltered.findIndex(
        (currentFile) => currentFile._id === file._id
      );
      const nextItem = filesFiltered[index + 1];
      return nextItem;
    }
  };

  const goToNextItem = async () => {
    if (type === "quick-item") {
      if (!quickFiles?.length) return;
      const filteredQuickFiles = quickFiles.filter(
        (currentFile) =>
          currentFile.metadata.hasThumbnail || currentFile.metadata.isVideo
      );
      const index = filteredQuickFiles.findIndex(
        (currentFile) => currentFile._id === file._id
      );
      const nextItem = filteredQuickFiles[index + 1];
      if (nextItem) {
        dispatch(setPopupSelect({ type: "quick-item", file: nextItem }));
      }
    } else {
      if (!files?.pages) return;
      const nextItem = findNextFilesItem();
      if (nextItem) {
        dispatch(setPopupSelect({ type: "file", file: nextItem }));
      } else if (!finalLastPageLoaded.current && !loadingNextPage.current) {
        loadingNextPage.current = true;
        const newFilesResponse = await fetchNextPage();
        if (!newFilesResponse.data?.pages) return;
        const fetchedNextItem = findNextFilesItem(newFilesResponse.data);
        if (fetchedNextItem) {
          dispatch(setPopupSelect({ type: "file", file: fetchedNextItem }));
        } else {
          finalLastPageLoaded.current = true;
        }
        loadingNextPage.current = false;
      }
    }
  };

  const closePhotoViewer = useCallback(() => {
    dispatch(resetPopupSelect());
  }, [resetPopupSelect]);

  useEffect(() => {
    if (file.metadata.isVideo) {
      getVideo();
    } else {
      getImage();
    }

    return () => {
      cleanUpVideo();
    };
  }, [file._id, getVideo, getImage, cleanUpVideo]);

  return (
    <div
      className="w-screen h-screen bg-black bg-opacity-80 absolute top-0 left-0 right-0 bottom-0 z-50 flex justify-center items-center flex-col"
      id="outer-wrapper"
    >
      {contextMenuState.selected && (
        <div onClick={clickStopPropagation}>
          <ContextMenu
            quickItemMode={false}
            contextSelected={contextMenuState}
            closeContext={closeContextMenu}
            file={file}
          />
        </div>
      )}

      <div
        className="absolute top-[20px] flex justify-between w-full"
        id="actions-wrapper"
      >
        <div className="ml-4 flex items-center">
          <span className="inline-flex items-center mr-[15px] max-w-[27px] min-w-[27px] min-h-[27px] max-h-[27px]">
            <div
              className="h-[27px] w-[27px] bg-red-500 rounded-[3px] flex flex-row justify-center items-center"
              style={{ background: imageColor }}
            >
              <span className="font-semibold text-[9.5px] text-white">
                {fileExtension}
              </span>
            </div>
          </span>
          <p className="text-md text-white text-ellipsis overflow-hidden max-w-[200px] md:max-w-[600px] whitespace-nowrap">
            {file.filename}
          </p>
        </div>
        <div className="flex mr-4">
          <div onClick={onContextMenu} id="action-context-wrapper">
            <ActionsIcon
              className="pointer text-white w-[20px] h-[25px] mr-4"
              id="action-context-icon"
            />
          </div>

          <div onClick={closePhotoViewer} id="action-close-wrapper">
            <CloseIcon
              className="pointer text-white w-[25px] h-[25px]"
              id="action-close-icon"
            />
          </div>
        </div>
      </div>
      <div className="flex absolute pb-[70px] desktopMode:pb-0 top-[50px] bottom-0 w-full h-full justify-between items-end desktopMode:items-center p-4">
        <CircleLeftIcon
          onClick={goToPreviousItem}
          className="pointer text-white w-[30px] h-[30px] select-none"
        />
        <CircleRightIcon
          onClick={goToNextItem}
          className="pointer text-white w-[30px] h-[30px] select-none"
        />
      </div>
      <div
        ref={wrapperRef}
        className="max-w-[80vw] max-h-[80vh] flex justify-center items-center"
      >
        {!file.metadata.isVideo && (
          <img src={image} className="max-w-full max-h-full object-contain" />
        )}
        {file.metadata.isVideo && (
          <video
            src={video}
            ref={videoRef}
            className="max-w-full max-h-full object-contain"
            controls
          ></video>
        )}
      </div>
    </div>
  );
});

export default PhotoViewerPopup;
