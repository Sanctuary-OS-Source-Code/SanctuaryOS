import React from "react";

export function ModalManager({ modals, closeAll, specificCloseActions }: any) {

  return (
    <>

      {Object.values(modals).some(isOpen => isOpen) && (
        <div 
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[3px] transition-opacity"
          onClick={closeAll}
        />
      )}
    </>
  );
}
