import axios from "../axiosInterceptor";

interface MapType {
  [key: string]: {
    token: any;
    cancel: () => {};
  };
}

const cancelTokens: MapType = {};

// TODO: Fix any
export const addFileUploadCancelToken = (id: string, cancelToken: any) => {
  cancelTokens[id] = cancelToken;
};

export const getCancelToken = (id: string) => {
  console.log("cancel tokens", cancelTokens);
  return cancelTokens[id];
};

export const cancelAllFileUploads = () => {
  for (const key in cancelTokens) {
    cancelTokens[key].cancel();
  }
};

//   export const cancelFileUpload = (fileId) => {

//   };
