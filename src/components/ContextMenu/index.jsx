import classNames from "classnames";
import React, { useEffect, useRef } from "react";
import Swal from "sweetalert2";
import {
  deleteFileAPI,
  renameFileAPI,
  downloadFileAPI,
} from "../../api/filesAPI";
import { useFilesClient, useQuickFilesClient } from "../../hooks/files";
import { useFoldersClient } from "../../hooks/folders";
import { useDispatch } from "react-redux";
import { setMoverID } from "../../actions/mover";
import { setShareSelected } from "../../actions/selectedItem";
import { deleteFolder, renameFolder } from "../../api/foldersAPI";
import { useClickOutOfBounds } from "../../hooks/utils";

const ContextMenu = (props) => {
  const { invalidateFilesCache } = useFilesClient();
  const { invalidateFoldersCache } = useFoldersClient();
  const { invalidateQuickFilesCache } = useQuickFilesClient();
  const { wrapperRef } = useClickOutOfBounds(props.closeContext);
  const dispatch = useDispatch();
  const liClassname =
    "flex w-full px-[20px] py-[12px] items-center font-normal text-[#637381] justify-start no-underline transition-all duration-400 ease-in-out text- hover:bg-[#f6f5fd] hover:text-[#3c85ee] hover:font-medium";
  const spanClassname = "inline-flex mr-[18px]";

  const renameItem = async () => {
    props.closeContext();
    if (!props.folderMode) {
      const { value: filename } = await Swal.fire({
        title: "Enter A File Name",
        input: "text",
        inputValue: props.file.filename,
        showCancelButton: true,
        inputValidator: (value) => {
          if (!value) {
            return "Please Enter a Name";
          }
        },
      });
      await renameFileAPI(props.file._id, filename);
      invalidateFilesCache();
      invalidateQuickFilesCache();
    } else {
      const { value: folderName } = await Swal.fire({
        title: "Enter A folder Name",
        input: "text",
        inputValue: props.folder.name,
        showCancelButton: true,
        inputValidator: (value) => {
          if (!value) {
            return "Please Enter a Name";
          }
        },
      });

      if (folderName === undefined || folderName === null) {
        return;
      }

      await renameFolder(props.folder._id, folderName);
      invalidateFoldersCache();
    }
  };

  const deleteItem = async () => {
    props.closeContext();
    if (!props.folderMode) {
      const result = await Swal.fire({
        title: "Confirm Deletion",
        text: "You cannot undo this action",
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#3085d6",
        cancelButtonColor: "#d33",
        confirmButtonText: "Yes, delete",
      });

      if (result.value) {
        await deleteFileAPI(props.file._id);
        invalidateFilesCache();
        invalidateQuickFilesCache();
      }
    } else {
      const result = await Swal.fire({
        title: "Confirm Deletion",
        text: "You cannot undo this action",
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#3085d6",
        cancelButtonColor: "#d33",
        confirmButtonText: "Yes, delete",
      });
      if (result.value) {
        await deleteFolder(props.folder._id, props.folder.parentList);
        invalidateFoldersCache();
      }
    }
  };

  const openMoveItemModal = async () => {
    props.closeContext();
    if (!props.folderMode) {
      dispatch(setMoverID(props.file._id, props.file.metadata.parent, true));
    } else {
      dispatch(setMoverID(props.folder._id, props.folder.parent, false));
    }
  };

  const openShareItemModal = () => {
    props.closeContext();
    dispatch(setShareSelected(props.file));
  };

  const downloadItem = () => {
    props.closeContext();
    downloadFileAPI(props.file._id);
  };

  return (
    <div
      onClick={props.stopPropagation}
      ref={wrapperRef}
      className={classNames(
        "fixed min-w-[215px] bg-white shadow-[0px_2px_4px_rgba(0,0,0,0.15),_inset_0px_1px_0px_#f5f7fa] rounded-[4px] mt-[-5px] z-[2] ",
        props.contextSelected.selected ? "opacity-100" : "opacity-0"
      )}
      style={
        props.contextSelected.selected
          ? {
              display: "block",
              left: `${props.contextSelected.X}px`,
              top: `${props.contextSelected.Y}px`,
            }
          : { display: "none" }
      }
    >
      <ul className="p-0 list-none m-0 ">
        <li onClick={renameItem} className={liClassname}>
          <a className="flex">
            <span className={spanClassname}>
              <img src="/assets/filesetting1.svg" alt="setting" />
            </span>
            Rename
          </a>
        </li>
        {!props.folderMode ? (
          <li onClick={openShareItemModal} className={liClassname}>
            <a className="flex" data-modal="share__modal">
              <span
                className="inline-flex mr-[18px]
"
              >
                <img src="/assets/filesetting2.svg" alt="setting" />
              </span>
              Share
            </a>
          </li>
        ) : undefined}
        {!props.folderMode ? (
          <li onClick={downloadItem} className={liClassname}>
            <a className="flex">
              <span className={spanClassname}>
                <img src="/assets/filesetting3.svg" alt="setting" />
              </span>
              Download
            </a>
          </li>
        ) : undefined}
        <li onClick={openMoveItemModal} className={liClassname}>
          <a className="flex" data-modal="destination__modal">
            <span className={spanClassname}>
              <img src="/assets/filesetting4.svg" alt="setting" />
            </span>{" "}
            Move
          </a>
        </li>
        <li onClick={deleteItem} className={liClassname}>
          <a className="flex">
            <span className={spanClassname}>
              <img src="/assets/filesetting5.svg" alt="setting" />
            </span>
            Delete
          </a>
        </li>
      </ul>
    </div>
  );
};

export default ContextMenu;
