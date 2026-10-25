import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import CreateSeriesFromTMDBDialog from '@/components/admin/CreateSeriesFromTMDBDialog';
import { ContentType } from '@/types';

export function SeriesModalTest() {
  const [isOpen, setIsOpen] = useState(false);

  const handleSuccess = () => {
    setIsOpen(false);
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  return (
    <div className="p-6 space-y-4">
      <h2 className="text-2xl font-bold">Test Series Modal</h2>
      <p className="text-gray-600">
        Click the button below to test the series creation modal with TMDB integration.
      </p>
      
      <div className="space-x-4">
        <Button onClick={() => setIsOpen(true)}>
          Test Series Modal
        </Button>
      </div>

      <CreateSeriesFromTMDBDialog
        isOpen={isOpen}
        onClose={handleClose}
        onSuccess={handleSuccess}
        contentType={ContentType.SERIES}
      />

      <div className="mt-8 p-4 bg-gray-100 rounded-lg">
        <h3 className="font-semibold mb-2">Test Instructions:</h3>
        <ol className="list-decimal list-inside space-y-1 text-sm">
          <li>Click &quot;Test Series Modal&quot; to open the dialog</li>
          <li>Search for a series (try &quot;Vikings&quot; or &quot;Andor&quot;)</li>
          <li>Select a series from the results</li>
          <li>Click &quot;Next: Add Episode URLs&quot; (this should now work!)</li>
          <li>Add URLs for episodes and create the series</li>
        </ol>
      </div>

      <div className="mt-4 p-4 bg-blue-100 rounded-lg">
        <h3 className="font-semibold mb-2">🔧 Recent Fix:</h3>
        <p className="text-sm">
          Fixed the issue where the &quot;Next: Add Episode URLs&quot; button was disabled.
          The backend now correctly returns season information in the TV details endpoint.
        </p>
      </div>
    </div>
  );
}
