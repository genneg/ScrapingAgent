'use client';

import React, { useState, useCallback } from 'react';
import { FestivalData, VenueData, TeacherData, MusicianData, PriceData } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Edit2, Save, X, Plus, Trash2, MapPin, Calendar, Users, Music, DollarSign } from 'lucide-react';
import { formatDate } from '@/lib/date-utils';

interface DataPreviewProps {
  data: FestivalData;
  onEdit: (editedData: FestivalData) => void;
  onSave: () => void;
  onCancel: () => void;
  isEditing?: boolean;
}

export function DataPreview({
  data,
  onEdit,
  onSave,
  onCancel,
  isEditing = false
}: DataPreviewProps) {
  const [editedData, setEditedData] = useState<FestivalData>(data);
  const [activeTab, setActiveTab] = useState('basic');

  const handleFieldChange = useCallback((field: keyof FestivalData, value: any) => {
    setEditedData(prev => ({
      ...prev,
      [field]: value
    }));
  }, []);

  const handleVenueChange = useCallback((field: keyof VenueData, value: any) => {
    setEditedData(prev => ({
      ...prev,
      venue: {
        ...prev.venue!,
        [field]: value
      }
    }));
  }, []);

  const handleAdditionalVenueChange = useCallback((index: number, field: keyof VenueData, value: any) => {
    setEditedData(prev => ({
      ...prev,
      venues: prev.venues?.map((venue, i) =>
        i === index ? { ...venue, [field]: value } : venue
      ) || []
    }));
  }, []);

  const addVenue = useCallback(() => {
    setEditedData(prev => ({
      ...prev,
      venues: [...(prev.venues || []), { name: '', city: '', country: '' }]
    }));
  }, []);

  const removeVenue = useCallback((index: number) => {
    setEditedData(prev => ({
      ...prev,
      venues: prev.venues?.filter((_, i) => i !== index) || []
    }));
  }, []);

  const handleTeacherChange = useCallback((index: number, field: keyof TeacherData, value: any) => {
    setEditedData(prev => ({
      ...prev,
      teachers: prev.teachers?.map((teacher, i) =>
        i === index ? { ...teacher, [field]: value } : teacher
      )
    }));
  }, []);

  const handleMusicianChange = useCallback((index: number, field: keyof MusicianData, value: any) => {
    setEditedData(prev => ({
      ...prev,
      musicians: prev.musicians?.map((musician, i) =>
        i === index ? { ...musician, [field]: value } : musician
      )
    }));
  }, []);

  const handlePriceChange = useCallback((index: number, field: keyof PriceData, value: any) => {
    setEditedData(prev => ({
      ...prev,
      prices: prev.prices?.map((price, i) =>
        i === index ? { ...price, [field]: value } : price
      )
    }));
  }, []);

  const addTeacher = useCallback(() => {
    setEditedData(prev => ({
      ...prev,
      teachers: [...(prev.teachers || []), { name: '', specialties: [], bio: '' }]
    }));
  }, []);

  const validateTeacherName = useCallback((name: string, excludeIndex?: number) => {
    if (!name.trim()) return false;

    const existingNames = (editedData.teachers || [])
      .filter((_, index) => index !== excludeIndex)
      .map(t => t.name.toLowerCase().trim());

    return !existingNames.includes(name.toLowerCase().trim());
  }, [editedData.teachers]);

  const addMusician = useCallback(() => {
    setEditedData(prev => ({
      ...prev,
      musicians: [...(prev.musicians || []), { name: '', genre: [], bio: '' }]
    }));
  }, []);

  const validateMusicianName = useCallback((name: string, excludeIndex?: number) => {
    if (!name.trim()) return false;

    const existingNames = (editedData.musicians || [])
      .filter((_, index) => index !== excludeIndex)
      .map(m => m.name.toLowerCase().trim());

    return !existingNames.includes(name.toLowerCase().trim());
  }, [editedData.musicians]);

  const addPrice = useCallback(() => {
    setEditedData(prev => ({
      ...prev,
      prices: [...(prev.prices || []), { type: '', amount: 0, currency: 'USD' }]
    }));
  }, []);

  const removeTeacher = useCallback((index: number) => {
    setEditedData(prev => ({
      ...prev,
      teachers: prev.teachers?.filter((_, i) => i !== index)
    }));
  }, []);

  const removeMusician = useCallback((index: number) => {
    setEditedData(prev => ({
      ...prev,
      musicians: prev.musicians?.filter((_, i) => i !== index)
    }));
  }, []);

  const removePrice = useCallback((index: number) => {
    setEditedData(prev => ({
      ...prev,
      prices: prev.prices?.filter((_, i) => i !== index)
    }));
  }, []);

  const handleSaveEdit = useCallback(() => {
    onEdit(editedData);
    onSave();
  }, [editedData, onEdit, onSave]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold high-contrast-text">Data Preview</h2>
        <div className="flex gap-2">
          <Button onClick={onSave} className="btn-high-contrast">
            <Save className="w-4 h-4 mr-2" />
            Save to Database
          </Button>
          {!isEditing ? (
            <Button onClick={() => onEdit(editedData)} variant="outline" className="btn-secondary-high-contrast">
              <Edit2 className="w-4 h-4 mr-2" />
              Edit
            </Button>
          ) : (
            <Button onClick={handleSaveEdit} variant="default" className="btn-high-contrast">
              <Save className="w-4 h-4 mr-2" />
              Save Changes
            </Button>
          )}
          {!isEditing ? null : (
            <Button onClick={onCancel} variant="outline" className="btn-secondary-high-contrast">
              <X className="w-4 h-4 mr-2" />
              Cancel Edit
            </Button>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5 bg-white border-2 border-black">
          <TabsTrigger value="basic" className="tab-trigger-high-contrast">Basic Info</TabsTrigger>
          <TabsTrigger value="venue" className="tab-trigger-high-contrast">Venue</TabsTrigger>
          <TabsTrigger value="people" className="tab-trigger-high-contrast">People</TabsTrigger>
          <TabsTrigger value="pricing" className="tab-trigger-high-contrast">Pricing</TabsTrigger>
          <TabsTrigger value="tags" className="tab-trigger-high-contrast">Tags</TabsTrigger>
        </TabsList>

        <TabsContent value="basic" className="space-y-4">
          <Card className="card-high-contrast">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 high-contrast-text">
                <Calendar className="w-5 h-5 high-contrast-text" />
                Basic Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name" className="label-high-contrast">Festival Name</Label>
                  {isEditing ? (
                    <Input
                      id="name"
                      value={editedData.name}
                      onChange={(e) => handleFieldChange('name', e.target.value)}
                      className="input-high-contrast"
                    />
                  ) : (
                    <p className="text-lg font-semibold high-contrast-text">{editedData.name}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="website" className="label-high-contrast">Website</Label>
                  {isEditing ? (
                    <Input
                      id="website"
                      value={editedData.website || ''}
                      onChange={(e) => handleFieldChange('website', e.target.value)}
                      className="input-high-contrast"
                    />
                  ) : (
                    <a
                      href={editedData.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary-high-contrast underline"
                    >
                      {editedData.website || 'Not provided'}
                    </a>
                  )}
                </div>
              </div>

              <div>
                <Label htmlFor="description" className="label-high-contrast">Description</Label>
                {isEditing ? (
                  <Textarea
                    id="description"
                    value={editedData.description || ''}
                    onChange={(e) => handleFieldChange('description', e.target.value)}
                    rows={4}
                    className="input-high-contrast"
                  />
                ) : (
                  <p className="high-contrast-text">{editedData.description || 'No description provided'}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="startDate" className="label-high-contrast">Start Date</Label>
                  {isEditing ? (
                    <Input
                      id="startDate"
                      type="date"
                      value={formatDate(editedData.startDate, 'yyyy-MM-dd')}
                      onChange={(e) => handleFieldChange('startDate', new Date(e.target.value))}
                      className="input-high-contrast"
                    />
                  ) : (
                    <p className="high-contrast-text">{formatDate(editedData.startDate, 'PPP')}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="endDate" className="label-high-contrast">End Date</Label>
                  {isEditing ? (
                    <Input
                      id="endDate"
                      type="date"
                      value={formatDate(editedData.endDate, 'yyyy-MM-dd')}
                      onChange={(e) => handleFieldChange('endDate', new Date(e.target.value))}
                      className="input-high-contrast"
                    />
                  ) : (
                    <p className="high-contrast-text">{formatDate(editedData.endDate, 'PPP')}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="email" className="label-high-contrast">Email</Label>
                  {isEditing ? (
                    <Input
                      id="email"
                      type="email"
                      value={editedData.email || ''}
                      onChange={(e) => handleFieldChange('email', e.target.value)}
                      className="input-high-contrast"
                    />
                  ) : (
                    <p className="high-contrast-text">{editedData.email || 'Not provided'}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="phone" className="label-high-contrast">Phone</Label>
                  {isEditing ? (
                    <Input
                      id="phone"
                      value={editedData.phone || ''}
                      onChange={(e) => handleFieldChange('phone', e.target.value)}
                      className="input-high-contrast"
                    />
                  ) : (
                    <p className="high-contrast-text">{editedData.phone || 'Not provided'}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="sourceUrl" className="label-high-contrast">Source URL</Label>
                  {isEditing ? (
                    <Input
                      id="sourceUrl"
                      value={editedData.sourceUrl || ''}
                      onChange={(e) => handleFieldChange('sourceUrl', e.target.value)}
                      className="input-high-contrast"
                    />
                  ) : (
                    <a
                      href={editedData.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary-high-contrast underline text-sm"
                    >
                      View Source
                    </a>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="venue" className="space-y-4">
          <Card className="card-high-contrast">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 high-contrast-text">
                <MapPin className="w-5 h-5 high-contrast-text" />
                Venue Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {editedData.venue ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="venueName" className="label-high-contrast">Venue Name</Label>
                      {isEditing ? (
                        <Input
                          id="venueName"
                          value={editedData.venue.name}
                          onChange={(e) => handleVenueChange('name', e.target.value)}
                          className="input-high-contrast"
                        />
                      ) : (
                        <p className="font-semibold high-contrast-text">{editedData.venue.name}</p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="city" className="label-high-contrast">City</Label>
                      {isEditing ? (
                        <Input
                          id="city"
                          value={editedData.venue.city || ''}
                          onChange={(e) => handleVenueChange('city', e.target.value)}
                          className="input-high-contrast"
                        />
                      ) : (
                        <p className="high-contrast-text">{editedData.venue.city || 'Not provided'}</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="address" className="label-high-contrast">Address</Label>
                    {isEditing ? (
                      <Textarea
                        id="address"
                        value={editedData.venue.address || ''}
                        onChange={(e) => handleVenueChange('address', e.target.value)}
                        className="input-high-contrast"
                        rows={2}
                      />
                    ) : (
                      <p className="high-contrast-text">{editedData.venue.address || 'No address provided'}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="state" className="label-high-contrast">State</Label>
                      {isEditing ? (
                        <Input
                          id="state"
                          value={editedData.venue.state || ''}
                          onChange={(e) => handleVenueChange('state', e.target.value)}
                          className="input-high-contrast"
                        />
                      ) : (
                        <p className="high-contrast-text">{editedData.venue.state || 'Not provided'}</p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="country" className="label-high-contrast">Country</Label>
                      {isEditing ? (
                        <Input
                          id="country"
                          value={editedData.venue.country || ''}
                          onChange={(e) => handleVenueChange('country', e.target.value)}
                          className="input-high-contrast"
                        />
                      ) : (
                        <p className="high-contrast-text">{editedData.venue.country || 'Not provided'}</p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="postalCode" className="label-high-contrast">Postal Code</Label>
                      {isEditing ? (
                        <Input
                          id="postalCode"
                          value={editedData.venue.postalCode || ''}
                          onChange={(e) => handleVenueChange('postalCode', e.target.value)}
                          className="input-high-contrast"
                        />
                      ) : (
                        <p className="high-contrast-text">{editedData.venue.postalCode || 'Not provided'}</p>
                      )}
                    </div>
                  </div>

                  {editedData.venue.latitude && editedData.venue.longitude && (
                    <div className="text-sm text-muted-high-contrast">
                      Coordinates: {editedData.venue.latitude.toFixed(4)}, {editedData.venue.longitude.toFixed(4)}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-muted-high-contrast">No venue information available</p>
              )}
            </CardContent>
          </Card>

          {/* Additional Venues Section */}
          {editedData.venues && editedData.venues.length > 0 && (
            <Card className="card-high-contrast">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 high-contrast-text">
                  <MapPin className="w-5 h-5 high-contrast-text" />
                  Additional Venues
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {editedData.venues.map((venue, index) => (
                    <div key={index} className="border-2 border-black rounded p-3 space-y-2 bg-white">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <Label className="label-high-contrast">Additional Venue #{index + 1}</Label>
                        </div>
                        {isEditing && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeVenue(index)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor={`add-venue-name-${index}`} className="label-high-contrast">Venue Name</Label>
                          {isEditing ? (
                            <Input
                              id={`add-venue-name-${index}`}
                              value={venue.name}
                              onChange={(e) => handleAdditionalVenueChange(index, 'name', e.target.value)}
                              className="input-high-contrast"
                            />
                          ) : (
                            <p className="font-medium high-contrast-text">{venue.name}</p>
                          )}
                        </div>
                        <div>
                          <Label htmlFor={`add-venue-city-${index}`} className="label-high-contrast">City</Label>
                          {isEditing ? (
                            <Input
                              id={`add-venue-city-${index}`}
                              value={venue.city}
                              onChange={(e) => handleAdditionalVenueChange(index, 'city', e.target.value)}
                              className="input-high-contrast"
                            />
                          ) : (
                            <p className="high-contrast-text">{venue.city}</p>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor={`add-venue-country-${index}`} className="label-high-contrast">Country</Label>
                          {isEditing ? (
                            <Input
                              id={`add-venue-country-${index}`}
                              value={venue.country}
                              onChange={(e) => handleAdditionalVenueChange(index, 'country', e.target.value)}
                              className="input-high-contrast"
                            />
                          ) : (
                            <p className="high-contrast-text">{venue.country}</p>
                          )}
                        </div>
                        <div>
                          <Label htmlFor={`add-venue-address-${index}`} className="label-high-contrast">Address</Label>
                          {isEditing ? (
                            <Input
                              id={`add-venue-address-${index}`}
                              value={venue.address || ''}
                              onChange={(e) => handleAdditionalVenueChange(index, 'address', e.target.value)}
                              className="input-high-contrast"
                            />
                          ) : (
                            <p className="high-contrast-text">{venue.address || 'Not provided'}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {isEditing && (
            <Button variant="outline" onClick={addVenue} className="w-full btn-secondary-high-contrast">
              <Plus className="w-4 h-4 mr-2" />
              Add Additional Venue
            </Button>
          )}
        </TabsContent>

        <TabsContent value="people" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="card-high-contrast">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 high-contrast-text">
                  <Users className="w-5 h-5 high-contrast-text" />
                  Teachers
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {editedData.teachers?.map((teacher, index) => (
                    <div key={index} className="border-2 border-black rounded p-3 space-y-2 bg-white">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <Label htmlFor={`teacher-${index}`} className="label-high-contrast">Teacher Name</Label>
                          {isEditing ? (
                            <div>
                              <Input
                                id={`teacher-${index}`}
                                value={teacher.name}
                                onChange={(e) => handleTeacherChange(index, 'name', e.target.value)}
                                className={`${!validateTeacherName(teacher.name, index) ? 'border-red-500' : ''} input-high-contrast`}
                              />
                              {!validateTeacherName(teacher.name, index) && (
                                <p className="text-sm text-red-500 mt-1">
                                  {teacher.name.trim() ? 'Teacher name already exists' : 'Teacher name is required'}
                                </p>
                              )}
                            </div>
                          ) : (
                            <p className="font-medium high-contrast-text">{teacher.name}</p>
                          )}
                        </div>
                        {isEditing && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeTeacher(index)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>

                      {teacher.bio && (
                        <div>
                          <Label className="label-high-contrast">Bio</Label>
                          {isEditing ? (
                            <Textarea
                              value={teacher.bio}
                              onChange={(e) => handleTeacherChange(index, 'bio', e.target.value)}
                              rows={3}
                              placeholder="Teacher biography..."
                              className="input-high-contrast"
                            />
                          ) : (
                            <p className="text-sm text-muted-high-contrast line-clamp-3">{teacher.bio}</p>
                          )}
                        </div>
                      )}

                      {teacher.specialties && teacher.specialties.length > 0 && (
                        <div>
                          <Label className="label-high-contrast">Specialties</Label>
                          <div className="flex flex-wrap gap-1">
                            {teacher.specialties.map((specialty, idx) => (
                              <Badge key={idx} variant="outline" className="badge-high-contrast">
                                {specialty}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {isEditing && (
                    <Button variant="outline" onClick={addTeacher} className="w-full btn-secondary-high-contrast">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Teacher
                    </Button>
                  )}

                  {!editedData.teachers?.length && !isEditing && (
                    <p className="text-muted-high-contrast">No teachers listed</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="card-high-contrast">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 high-contrast-text">
                  <Music className="w-5 h-5 high-contrast-text" />
                  Musicians
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {editedData.musicians?.map((musician, index) => (
                    <div key={index} className="border-2 border-black rounded p-3 space-y-2 bg-white">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <Label htmlFor={`musician-${index}`} className="label-high-contrast">Musician Name</Label>
                          {isEditing ? (
                            <div>
                              <Input
                                id={`musician-${index}`}
                                value={musician.name}
                                onChange={(e) => handleMusicianChange(index, 'name', e.target.value)}
                                className={`${!validateMusicianName(musician.name, index) ? 'border-red-500' : ''} input-high-contrast`}
                              />
                              {!validateMusicianName(musician.name, index) && (
                                <p className="text-sm text-red-500 mt-1">
                                  {musician.name.trim() ? 'Musician name already exists' : 'Musician name is required'}
                                </p>
                              )}
                            </div>
                          ) : (
                            <p className="font-medium high-contrast-text">{musician.name}</p>
                          )}
                        </div>
                        {isEditing && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeMusician(index)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>

                      {musician.bio && (
                        <div>
                          <Label className="label-high-contrast">Bio</Label>
                          {isEditing ? (
                            <Textarea
                              value={musician.bio}
                              onChange={(e) => handleMusicianChange(index, 'bio', e.target.value)}
                              rows={3}
                              placeholder="Musician biography..."
                              className="input-high-contrast"
                            />
                          ) : (
                            <p className="text-sm text-muted-high-contrast line-clamp-3">{musician.bio}</p>
                          )}
                        </div>
                      )}

                      {musician.genre && musician.genre.length > 0 && (
                        <div>
                          <Label className="label-high-contrast">Genres</Label>
                          <div className="flex flex-wrap gap-1">
                            {musician.genre.map((genre, idx) => (
                              <Badge key={idx} variant="outline" className="badge-high-contrast">
                                {genre}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {isEditing && (
                    <Button variant="outline" onClick={addMusician} className="w-full btn-secondary-high-contrast">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Musician
                    </Button>
                  )}

                  {!editedData.musicians?.length && !isEditing && (
                    <p className="text-muted-high-contrast">No musicians listed</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="pricing" className="space-y-4">
          <Card className="card-high-contrast">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 high-contrast-text">
                <DollarSign className="w-5 h-5 high-contrast-text" />
                Pricing Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {editedData.prices?.map((price, index) => (
                  <div key={index} className="border-2 border-black rounded p-3 space-y-2 bg-white">
                    <div className="flex justify-between items-start">
                      <div className="flex-1 grid grid-cols-3 gap-2">
                        <div>
                          <Label htmlFor={`price-type-${index}`} className="label-high-contrast">Type</Label>
                          {isEditing ? (
                            <Input
                              id={`price-type-${index}`}
                              value={price.type}
                              onChange={(e) => handlePriceChange(index, 'type', e.target.value)}
                              className="input-high-contrast"
                            />
                          ) : (
                            <p className="font-medium high-contrast-text">{price.type}</p>
                          )}
                        </div>
                        <div>
                          <Label htmlFor={`price-amount-${index}`} className="label-high-contrast">Amount</Label>
                          {isEditing ? (
                            <Input
                              id={`price-amount-${index}`}
                              type="number"
                              value={price.amount}
                              onChange={(e) => handlePriceChange(index, 'amount', parseFloat(e.target.value))}
                              className="input-high-contrast"
                            />
                          ) : (
                            <p className="high-contrast-text">{price.amount} {price.currency}</p>
                          )}
                        </div>
                        <div>
                          <Label htmlFor={`price-currency-${index}`} className="label-high-contrast">Currency</Label>
                          {isEditing ? (
                            <Input
                              id={`price-currency-${index}`}
                              value={price.currency}
                              onChange={(e) => handlePriceChange(index, 'currency', e.target.value)}
                              className="input-high-contrast"
                            />
                          ) : (
                            <p className="high-contrast-text">{price.currency}</p>
                          )}
                        </div>
                      </div>
                      {isEditing && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removePrice(index)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>

                    {price.description && (
                      <div>
                        <Label className="label-high-contrast">Description</Label>
                        {isEditing ? (
                          <Textarea
                            value={price.description}
                            onChange={(e) => handlePriceChange(index, 'description', e.target.value)}
                            rows={2}
                            className="input-high-contrast"
                          />
                        ) : (
                          <p className="text-sm text-muted-high-contrast">{price.description}</p>
                        )}
                      </div>
                    )}

                    {price.deadline && (
                      <div>
                        <Label className="label-high-contrast">Deadline</Label>
                        {isEditing ? (
                          <Input
                            type="date"
                            value={formatDate(price.deadline, 'yyyy-MM-dd')}
                            onChange={(e) => handlePriceChange(index, 'deadline', new Date(e.target.value))}
                            className="input-high-contrast"
                          />
                        ) : (
                          <p className="text-sm text-muted-high-contrast">{formatDate(price.deadline, 'PPP')}</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {isEditing && (
                  <Button variant="outline" onClick={addPrice} className="w-full btn-secondary-high-contrast">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Price
                  </Button>
                )}

                {!editedData.prices?.length && !isEditing && (
                  <p className="text-muted-high-contrast">No pricing information available</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tags" className="space-y-4">
          <Card className="card-high-contrast">
            <CardHeader>
              <CardTitle className="high-contrast-text">Tags</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {editedData.tags && editedData.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {editedData.tags.map((tag, index) => (
                      <Badge key={index} variant="outline" className="badge-high-contrast">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-high-contrast">No tags assigned</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}